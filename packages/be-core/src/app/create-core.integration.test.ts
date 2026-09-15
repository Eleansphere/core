import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { QueryTypes } from 'sequelize';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ModelConfig } from '@eleansphere/schema';
import { createCore, CoreInstance, AppConfig } from './create-app';
import { createTestSchema, TestSchema, TEST_DATABASE_URL } from '../test-utils/test-database';

const JWT_SECRET = 'integration-test-secret';

const bookConfig: ModelConfig = {
  name: 'book',
  prefix: 'bk_',
  userScoped: true,
  fields: {
    title: { type: 'STRING', required: true, minLength: 2 },
    rating: { type: 'INTEGER', min: 1, max: 5 },
    readingStatus: {
      type: 'ENUM',
      values: ['want', 'reading', 'read'],
      required: true,
      default: 'want',
    },
    finishedAt: { type: 'DATEONLY' },
    lastReminderSentAt: { type: 'DATE', readOnly: true },
  },
  query: {
    filter: { readingStatus: 'in', rating: 'range', finishedAt: 'isNull' },
    sort: ['title', 'rating'],
    defaultSort: '-createdAt',
    search: ['title'],
    maxLimit: 3,
  },
};

const loanConfig: ModelConfig = {
  name: 'loan',
  prefix: 'ln_',
  userScoped: true,
  fields: {
    bookId: { type: 'STRING', required: true },
    returnedAt: { type: 'DATEONLY' },
  },
  indexes: [{ fields: ['bookId'], unique: true, where: { returnedAt: null } }],
};

/** No `access` and not userScoped: must default to signed-in users only. */
const noteConfig: ModelConfig = {
  name: 'note',
  prefix: 'nt_',
  fields: { text: { type: 'TEXT', required: true } },
};

const announcementConfig: ModelConfig = {
  name: 'announcement',
  prefix: 'an_',
  access: { read: 'public', write: 'admin' },
  fields: { message: { type: 'TEXT', required: true } },
};

const userConfig: ModelConfig = {
  name: 'user',
  prefix: 'u_',
  skipAutoRoutes: true,
  fields: {
    email: { type: 'STRING', required: true, unique: true, format: 'email' },
    password: { type: 'STRING', required: true, sensitive: true },
    role: { type: 'ENUM', values: ['user', 'admin'], default: 'user', readOnly: true },
  },
};

function bearer(userId: string, role = 'user'): string {
  return `Bearer ${jwt.sign({ id: userId, email: `${userId}@test.cz`, role }, JWT_SECRET)}`;
}

const ALICE = bearer('u_alice');
const BOB = bearer('u_bob');
const ADMIN = bearer('u_root', 'admin');

describe('createCore against Postgres', () => {
  let testSchema: TestSchema;
  let core: CoreInstance;

  const baseConfig = (): AppConfig => ({
    databaseUrl: TEST_DATABASE_URL,
    dbSsl: false,
    schema: testSchema.name,
    jwtSecret: JWT_SECRET,
    modelConfigs: [bookConfig, loanConfig, noteConfig, announcementConfig, userConfig],
    auth: { modelName: 'user', tokenClaims: ['role'] },
  });

  const createBook = (token: string, body: Record<string, unknown>) =>
    request(core.app).post('/api/books').set('Authorization', token).send(body);

  beforeAll(async () => {
    testSchema = await createTestSchema();
    core = await createCore(baseConfig());
  });

  afterAll(async () => {
    await core?.close();
    await testSchema?.drop();
  });

  describe('schema', () => {
    it('adds an ownerId column to owner-scoped models, and none elsewhere', async () => {
      const columns = await core.sequelize.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = :schema AND column_name = 'ownerId'`,
        { replacements: { schema: testSchema.name }, type: QueryTypes.SELECT }
      );
      expect(columns.map((column) => column.table_name).sort()).toEqual(['books', 'loans']);
    });

    it('creates declared partial indexes', async () => {
      const indexes = await core.sequelize.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = :schema AND tablename = 'loans'`,
        { replacements: { schema: testSchema.name }, type: QueryTypes.SELECT }
      );
      expect(indexes.map((index) => index.indexdef)).toContainEqual(
        expect.stringMatching(/UNIQUE INDEX .*\("bookId"\) WHERE \("returnedAt" IS NULL\)/)
      );
    });
  });

  describe('access', () => {
    it('rejects anonymous calls to a model without explicit access', async () => {
      expect((await request(core.app).get('/api/notes')).status).toBe(401);
      expect((await request(core.app).post('/api/notes').send({ text: 'x' })).status).toBe(401);

      const created = await request(core.app)
        .post('/api/notes')
        .set('Authorization', ALICE)
        .send({ text: 'x' });
      expect(created.status).toBe(201);
    });

    it('applies public read / admin write', async () => {
      expect((await request(core.app).get('/api/announcements')).status).toBe(200);
      const asUser = await request(core.app)
        .post('/api/announcements')
        .set('Authorization', ALICE)
        .send({ message: 'hi' });
      expect(asUser.status).toBe(403);
      const asAdmin = await request(core.app)
        .post('/api/announcements')
        .set('Authorization', ADMIN)
        .send({ message: 'hi' });
      expect(asAdmin.status).toBe(201);
    });

    it('rejects an invalid token even on a public route', async () => {
      const res = await request(core.app)
        .get('/api/announcements')
        .set('Authorization', 'Bearer not-a-jwt');
      expect(res.status).toBe(401);
    });

    it('refuses to start when a role policy has no role claim in the token', async () => {
      await expect(createCore({ ...baseConfig(), auth: { modelName: 'user' } })).rejects.toThrow(
        /announcement.*tokenClaims/
      );
    });
  });

  describe('owner-scoped writes', () => {
    it('stamps the owner from the token and ignores id, ownerId and readOnly fields', async () => {
      const res = await createBook(ALICE, {
        id: 'bk_chosen',
        title: 'Dune',
        ownerId: 'u_bob',
        lastReminderSentAt: '2026-01-01T00:00:00Z',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: 'Dune', ownerId: 'u_alice', readingStatus: 'want' });
      expect(res.body.id).not.toBe('bk_chosen');
      expect(res.body.id).toMatch(/^bk_[0-9a-f]{32}$/);
      expect(res.body.lastReminderSentAt).toBeNull();
    });

    it('hides another owner’s rows: 404 on read, update and delete', async () => {
      const { body: book } = await createBook(ALICE, { title: 'Private' });

      for (const call of [
        request(core.app).get(`/api/books/${book.id}`),
        request(core.app).patch(`/api/books/${book.id}`).send({ title: 'Stolen' }),
        request(core.app).delete(`/api/books/${book.id}`),
      ]) {
        expect((await call.set('Authorization', BOB)).status).toBe(404);
      }
      const list = await request(core.app).get('/api/books').set('Authorization', BOB);
      expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(book.id);
    });

    it('returns coded validation issues', async () => {
      const res = await createBook(ALICE, { title: 'D', rating: 9, readingStatus: 'burned' });

      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        { path: 'title', code: 'minLength', params: { minLength: 2 } },
        { path: 'rating', code: 'max', params: { max: 5 } },
        { path: 'readingStatus', code: 'enum', params: { values: ['want', 'reading', 'read'] } },
      ]);
    });

    it('PATCH validates and changes only the fields sent', async () => {
      const { body: book } = await createBook(ALICE, { title: 'Hyperion', rating: 3 });

      const patched = await request(core.app)
        .patch(`/api/books/${book.id}`)
        .set('Authorization', ALICE)
        .send({ rating: 4 });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ title: 'Hyperion', rating: 4 });

      const cleared = await request(core.app)
        .patch(`/api/books/${book.id}`)
        .set('Authorization', ALICE)
        .send({ title: null });
      expect(cleared.status).toBe(400);
      expect(cleared.body.issues).toEqual([{ path: 'title', code: 'required' }]);
    });
  });

  describe('list query', () => {
    const CAROL = bearer('u_carol');
    const listBooks = (query: Record<string, string>) =>
      request(core.app).get('/api/books').set('Authorization', CAROL).query(query);
    const titlesOf = (res: request.Response) =>
      res.body.data.map((row: { title: string }) => row.title);

    beforeAll(async () => {
      await createBook(CAROL, {
        title: 'Dune',
        rating: 5,
        readingStatus: 'read',
        finishedAt: '2026-05-01',
      });
      await createBook(CAROL, { title: 'Dune Messiah', rating: 3, readingStatus: 'reading' });
      await createBook(CAROL, { title: 'Hyperion', rating: 4, readingStatus: 'want' });
      await createBook(CAROL, { title: '100% Pure', rating: 2, readingStatus: 'want' });
    });

    it('filters with in, range and isNull', async () => {
      expect(titlesOf(await listBooks({ readingStatus: 'read,reading', sort: 'title' }))).toEqual([
        'Dune',
        'Dune Messiah',
      ]);
      expect(titlesOf(await listBooks({ 'rating[gte]': '4', sort: '-rating' }))).toEqual([
        'Dune',
        'Hyperion',
      ]);
      expect(titlesOf(await listBooks({ 'finishedAt[isNull]': 'false' }))).toEqual(['Dune']);
    });

    it('searches case-insensitively and treats % literally', async () => {
      expect(titlesOf(await listBooks({ q: 'dune', sort: 'title' }))).toEqual([
        'Dune',
        'Dune Messiah',
      ]);
      expect(titlesOf(await listBooks({ q: '0%' }))).toEqual(['100% Pure']);
    });

    it('paginates with total, clamping limit to maxLimit', async () => {
      const firstPage = await listBooks({ sort: 'title', limit: '50' });
      expect(firstPage.body).toMatchObject({ total: 4, page: 1, limit: 3 });
      expect(titlesOf(firstPage)).toEqual(['100% Pure', 'Dune', 'Dune Messiah']);

      const secondPage = await listBooks({ sort: 'title', page: '2', limit: '3' });
      expect(titlesOf(secondPage)).toEqual(['Hyperion']);
    });

    it('rejects parameters and sorts the config does not declare', async () => {
      expect((await listBooks({ ownerId: 'u_alice' })).status).toBe(400);
      expect((await listBooks({ sort: 'lastReminderSentAt' })).status).toBe(400);
      expect((await listBooks({ rating: 'high' })).status).toBe(400);
    });
  });

  describe('indexes', () => {
    it('allows one active loan per book, enforced by the partial unique index', async () => {
      const lend = () =>
        request(core.app).post('/api/loans').set('Authorization', ALICE).send({ bookId: 'bk_1' });

      const first = await lend();
      expect(first.status).toBe(201);
      expect((await lend()).status).toBe(409);

      await request(core.app)
        .patch(`/api/loans/${first.body.id}`)
        .set('Authorization', ALICE)
        .send({ returnedAt: '2026-09-15' });
      expect((await lend()).status).toBe(201);
    });
  });

  describe('auth token claims', () => {
    it('puts configured claims into the login token', async () => {
      const User = core.models.user;
      await User.create({
        id: 'u_dave',
        email: 'dave@test.cz',
        password: await bcrypt.hash('secret-password', 4),
        role: 'admin',
      });

      const res = await request(core.app)
        .post('/api/auth/login')
        .send({ email: 'dave@test.cz', password: 'secret-password' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'u_dave', email: 'dave@test.cz', role: 'admin' });
      expect(jwt.verify(res.body.token, JWT_SECRET)).toMatchObject({ id: 'u_dave', role: 'admin' });
    });
  });
});
