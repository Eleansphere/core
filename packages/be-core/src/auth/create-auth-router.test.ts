import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi } from 'vitest';
import type { FieldConfig } from '@eleansphere/schema';
import { createAuthRouter, AuthConfig } from './create-auth-router';
import { defaultErrorHandler } from '../app/error-handler';
import { createFakeModel } from '../test-utils/fake-model';

const JWT_SECRET = 'test-secret';
const BCRYPT_TEST_ROUNDS = 4;
const PASSWORD = 'correct-password';

const userFields: Record<string, FieldConfig> = {
  email: { type: 'STRING', required: true, format: 'email' },
  password: { type: 'STRING', required: true, minLength: 8, sensitive: true },
  displayName: { type: 'STRING', required: true, minLength: 2 },
  role: { type: 'ENUM', values: ['user', 'admin'], default: 'user', readOnly: true },
};

type FakeModel = ReturnType<typeof createFakeModel>;

function buildApp(UserModel: FakeModel, overrides: Partial<AuthConfig> = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/auth',
    createAuthRouter(UserModel as any, {
      jwtSecret: JWT_SECRET,
      userFields,
      rateLimit: 'off',
      ...overrides,
    })
  );
  app.use(defaultErrorHandler);
  return app;
}

async function withAlice(): Promise<FakeModel> {
  return createFakeModel('user', [
    {
      id: 'u1',
      email: 'a@b.com',
      password: await bcrypt.hash(PASSWORD, BCRYPT_TEST_ROUNDS),
      role: 'user',
      displayName: 'Alice',
    },
  ]);
}

const aliceToken = `Bearer ${jwt.sign({ id: 'u1', email: 'a@b.com' }, JWT_SECRET)}`;

describe('createAuthRouter — login', () => {
  it('returns a session: a token with the configured claims, and the user', async () => {
    const app = buildApp(await withAlice(), { tokenClaims: ['role'] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'u1', email: 'a@b.com', role: 'user' });
    expect(res.body.user).toMatchObject({ displayName: 'Alice' });
    expect(res.body.refreshToken).toBeUndefined();
    expect(jwt.verify(res.body.token, JWT_SECRET)).toMatchObject({ id: 'u1', role: 'user' });
  });

  it('rejects a wrong password and an unknown email alike, with 401', async () => {
    const app = buildApp(await withAlice());

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@b.com', password: PASSWORD });

    expect([wrongPassword.status, unknownEmail.status]).toEqual([401, 401]);
  });

  it('reports missing credentials as required issues', async () => {
    const res = await request(buildApp(await withAlice()))
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([
      { path: 'email', code: 'required' },
      { path: 'password', code: 'required' },
    ]);
  });
});

describe('createAuthRouter — /me', () => {
  it('GET reads the user from the database', async () => {
    const UserModel = await withAlice();
    const app = buildApp(UserModel);

    const found = await request(app).get('/api/auth/me').set('Authorization', aliceToken);
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ id: 'u1', displayName: 'Alice' });

    UserModel.__rows.length = 0;
    expect((await request(app).get('/api/auth/me').set('Authorization', aliceToken)).status).toBe(
      404
    );
  });

  it('PATCH changes only the profile fields, validated', async () => {
    const UserModel = await withAlice();
    const app = buildApp(UserModel, { profileFields: ['displayName'] });

    const changed = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', aliceToken)
      .send({ displayName: 'Bob', role: 'admin', email: 'bob@b.com' });
    expect(changed.status).toBe(200);
    expect(UserModel.__rows[0]).toMatchObject({
      displayName: 'Bob',
      role: 'user',
      email: 'a@b.com',
    });

    const invalid = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', aliceToken)
      .send({ displayName: 'B' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues).toEqual([
      { path: 'displayName', code: 'minLength', params: { minLength: 2 } },
    ]);
  });

  it('PATCH is not mounted without profile fields', async () => {
    const res = await request(buildApp(await withAlice()))
      .patch('/api/auth/me')
      .set('Authorization', aliceToken)
      .send({ displayName: 'Bob' });

    expect(res.status).toBe(404);
  });
});

describe('createAuthRouter — register', () => {
  const register = { idPrefix: 'u_', fields: ['displayName'], defaults: { role: 'user' } };

  it('creates a signed-in user with a hashed password and server-side defaults', async () => {
    const UserModel = createFakeModel('user', []);
    const res = await request(buildApp(UserModel, { register })).post('/api/auth/register').send({
      email: 'new@b.com',
      password: 'secret-password',
      displayName: 'Newbie',
      role: 'admin',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    const created = UserModel.__rows[0];
    expect(created).toMatchObject({ email: 'new@b.com', displayName: 'Newbie', role: 'user' });
    expect(created.id).toMatch(/^u_/);
    expect(await bcrypt.compare('secret-password', created.password)).toBe(true);
  });

  it('validates with the user field rules', async () => {
    const UserModel = createFakeModel('user', []);
    const res = await request(buildApp(UserModel, { register }))
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', displayName: 'Newbie' });

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([
      { path: 'email', code: 'format', params: { format: 'email' } },
      { path: 'password', code: 'minLength', params: { minLength: 8 } },
    ]);
    expect(UserModel.__rows).toHaveLength(0);
  });

  it('rejects a duplicate email with 409 and a unique issue', async () => {
    const UserModel = await withAlice();
    const res = await request(buildApp(UserModel, { register }))
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'secret-password', displayName: 'Again' });

    expect(res.status).toBe(409);
    expect(res.body.issues).toEqual([{ path: 'email', code: 'unique' }]);
    expect(UserModel.__rows).toHaveLength(1);
  });

  it('is not mounted when `register` is omitted', async () => {
    const res = await request(buildApp(createFakeModel('user', [])))
      .post('/api/auth/register')
      .send({ email: 'new@b.com', password: 'secret-password' });

    expect(res.status).toBe(404);
  });
});

describe('createAuthRouter — change password', () => {
  const changePassword = (app: express.Express, body: Record<string, string>) =>
    request(app).post('/api/auth/change-password').set('Authorization', aliceToken).send(body);

  it('replaces the password and returns a new session', async () => {
    const UserModel = await withAlice();
    const res = await changePassword(buildApp(UserModel, { changePassword: true }), {
      currentPassword: PASSWORD,
      newPassword: 'new-password',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(await bcrypt.compare('new-password', UserModel.__rows[0].password)).toBe(true);
  });

  it('rejects a wrong current password and leaves the password unchanged', async () => {
    const UserModel = await withAlice();
    const hashBefore = UserModel.__rows[0].password;
    const res = await changePassword(buildApp(UserModel, { changePassword: true }), {
      currentPassword: 'wrong-password',
      newPassword: 'new-password',
    });

    expect(res.status).toBe(401);
    expect(UserModel.__rows[0].password).toBe(hashBefore);
  });

  it('validates the new password, reporting it under newPassword', async () => {
    const res = await changePassword(buildApp(await withAlice(), { changePassword: true }), {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([
      { path: 'newPassword', code: 'minLength', params: { minLength: 8 } },
    ]);
  });

  it('requires a signed-in user', async () => {
    const res = await request(buildApp(await withAlice(), { changePassword: true }))
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'new-password' });

    expect(res.status).toBe(401);
  });
});

describe('createAuthRouter — delete account', () => {
  it('deletes the account only after confirming the password', async () => {
    const UserModel = await withAlice();
    const beforeDeleteAccount = vi.fn(async () => undefined);
    const app = buildApp(UserModel, { deleteAccount: true, beforeDeleteAccount });
    const deleteMe = (password: string) =>
      request(app).delete('/api/auth/me').set('Authorization', aliceToken).send({ password });

    expect((await deleteMe('wrong-password')).status).toBe(401);
    expect(UserModel.__rows).toHaveLength(1);

    expect((await deleteMe(PASSWORD)).status).toBe(204);
    expect(UserModel.__rows).toHaveLength(0);
    expect(beforeDeleteAccount).toHaveBeenCalledOnce();
  });
});

describe('createAuthRouter — configuration', () => {
  it('limits login attempts per client', async () => {
    const app = buildApp(await withAlice(), { rateLimit: { windowMs: 60_000, max: 1 } });
    const attempt = () =>
      request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrong-password' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });

  it('refuses password reset without an email service', async () => {
    expect(() =>
      createAuthRouter(createFakeModel('user', []) as any, {
        jwtSecret: JWT_SECRET,
        passwordReset: {
          appBaseUrl: 'https://app.test',
          template: ({ resetLink }) => ({ subject: 'Reset', html: resetLink }),
        },
      })
    ).toThrow(/email service/);
  });
});
