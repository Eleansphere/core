import request from 'supertest';
import { QueryTypes } from 'sequelize';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { ModelConfig } from '@eleansphere/schema';
import { createCore, CoreInstance } from './create-app';
import { MemoryEmailTransport } from '../email/transports';
import { MemoryStorageAdapter } from '../files/storage/memory-storage-adapter';
import { createTestSchema, TestSchema, TEST_DATABASE_URL } from '../test-utils/test-database';

const JWT_SECRET = 'auth-integration-secret';
const PASSWORD = 'correct-horse';
const SENDER = 'Kniho-hlod <noreply@test.cz>';
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

const userConfig: ModelConfig = {
  name: 'user',
  prefix: 'u_',
  skipAutoRoutes: true,
  fields: {
    email: { type: 'STRING', required: true, unique: true, format: 'email' },
    password: { type: 'STRING', required: true, minLength: 8, sensitive: true },
    displayName: { type: 'STRING', required: true, minLength: 2 },
    role: { type: 'ENUM', values: ['user', 'admin'], default: 'user', readOnly: true },
  },
};

const bookConfig: ModelConfig = {
  name: 'book',
  prefix: 'bk_',
  userScoped: true,
  fields: { title: { type: 'STRING', required: true } },
};

const loanConfig: ModelConfig = {
  name: 'loan',
  prefix: 'ln_',
  userScoped: true,
  fields: { bookId: { type: 'STRING', required: true, references: { model: 'book' } } },
};

describe('auth against Postgres', () => {
  let testSchema: TestSchema;
  let core: CoreInstance;
  const outbox = new MemoryEmailTransport();
  const storage = new MemoryStorageAdapter();

  const api = () => request(core.app);
  const register = (email: string) =>
    api()
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, displayName: 'Reader', role: 'admin' });
  const login = (email: string, password = PASSWORD) =>
    api().post('/api/auth/login').send({ email, password });
  const refresh = (refreshToken: string) => api().post('/api/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    testSchema = await createTestSchema();
    core = await createCore({
      databaseUrl: TEST_DATABASE_URL,
      dbSsl: false,
      schema: testSchema.name,
      jwtSecret: JWT_SECRET,
      modelConfigs: [userConfig, bookConfig, loanConfig],
      email: { from: SENDER, transport: outbox },
      storage: { adapter: storage },
      auth: {
        modelName: 'user',
        tokenClaims: ['role'],
        refreshTokens: {},
        register: { idPrefix: 'u_', fields: ['displayName'] },
        changePassword: true,
        profileFields: ['displayName'],
        deleteAccount: true,
        rateLimit: 'off',
        passwordReset: {
          appBaseUrl: 'https://app.test',
          template: ({ resetLink }) => ({
            subject: 'Reset your password',
            html: `<a href="${resetLink}">Reset</a>`,
            text: resetLink,
          }),
        },
      },
    });
  });

  afterAll(async () => {
    await core?.close();
    await testSchema?.drop();
  });

  it('registers a signed-in user and ignores a role sent in the body', async () => {
    const res = await register('reader@test.cz');

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'reader@test.cz',
      displayName: 'Reader',
      role: 'user',
    });
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.refreshToken).toMatch(/^rt_[0-9a-f]{32}\.[\w-]+$/);
  });

  it('rotates refresh tokens and revokes the family when a used one comes back', async () => {
    const { body: session } = await register('rotate@test.cz');

    const rotated = await refresh(session.refreshToken);
    expect(rotated.status).toBe(200);
    expect(rotated.body.token).toBeTypeOf('string');
    expect(rotated.body.refreshToken).not.toBe(session.refreshToken);

    expect((await refresh(session.refreshToken)).status).toBe(401);
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { body: session } = await register('logout@test.cz');

    expect((await api().post('/api/auth/logout').send(session)).status).toBe(204);
    expect((await refresh(session.refreshToken)).status).toBe(401);
  });

  it('changing the password logs every other session out', async () => {
    const { body: first } = await register('change@test.cz');
    const { body: second } = await login('change@test.cz');

    const changed = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'battery-staple' });

    expect(changed.status).toBe(200);
    expect((await refresh(second.refreshToken)).status).toBe(401);
    expect((await refresh(changed.body.refreshToken)).status).toBe(200);
  });

  it('emails a password reset link that works exactly once', async () => {
    await register('forgot@test.cz');
    outbox.clear();

    const forgot = (email: string) => api().post('/api/auth/forgot-password').send({ email });
    expect((await forgot('nobody@test.cz')).status).toBe(200);
    expect((await forgot('forgot@test.cz')).status).toBe(200);
    await vi.waitFor(() => expect(outbox.sent).toHaveLength(1));
    expect(outbox.sent[0]).toMatchObject({ to: 'forgot@test.cz', from: SENDER });

    const token = new URL(outbox.sent[0].text ?? '').searchParams.get('token') ?? '';
    const reset = () =>
      api().post('/api/auth/reset-password').send({ token, newPassword: 'brand-new-secret' });

    expect((await reset()).status).toBe(200);
    expect((await reset()).status).toBe(400);
    expect((await login('forgot@test.cz')).status).toBe(401);
    expect((await login('forgot@test.cz', 'brand-new-secret')).status).toBe(200);
  });

  it('deleting the account removes what it owns, including uploaded files', async () => {
    const { body: session } = await register('leaving@test.cz');
    const authorization = `Bearer ${session.token}`;

    const book = await api()
      .post('/api/books')
      .set('Authorization', authorization)
      .send({ title: 'Dune' });
    const loan = await api()
      .post('/api/loans')
      .set('Authorization', authorization)
      .send({ bookId: book.body.id });
    const avatar = await api()
      .post('/api/files')
      .set('Authorization', authorization)
      .field('refType', 'user')
      .field('refId', session.id)
      .field('role', 'avatar')
      .attach('file', PNG_SIGNATURE, { filename: 'me.png', contentType: 'image/png' });
    expect([book.status, loan.status, avatar.status]).toEqual([201, 201, 201]);
    const storedObjectsBefore = storage.objects.size;

    const wrongPassword = await api()
      .delete('/api/auth/me')
      .set('Authorization', authorization)
      .send({ password: 'not-my-password' });
    expect(wrongPassword.status).toBe(401);

    const deleted = await api()
      .delete('/api/auth/me')
      .set('Authorization', authorization)
      .send({ password: PASSWORD });
    expect(deleted.status).toBe(204);

    const [remaining] = await core.sequelize.query<{ books: string; loans: string }>(
      `SELECT (SELECT count(*) FROM books WHERE "ownerId" = :id) AS books,
              (SELECT count(*) FROM loans WHERE "ownerId" = :id) AS loans`,
      { replacements: { id: session.id }, type: QueryTypes.SELECT }
    );
    expect([Number(remaining.books), Number(remaining.loans)]).toEqual([0, 0]);
    expect(storage.objects.size).toBe(storedObjectsBefore - 1);
    expect((await login('leaving@test.cz')).status).toBe(401);
  });
});
