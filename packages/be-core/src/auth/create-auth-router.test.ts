import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { describe, it, expect } from 'vitest';
import { createAuthRouter } from './create-auth-router';
import { defaultErrorHandler } from '../app/error-handler';
import { createFakeModel } from '../test-utils/fake-model';

const JWT_SECRET = 'test-secret';

function buildApp(UserModel: ReturnType<typeof createFakeModel>, configOverrides = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/auth',
    createAuthRouter(UserModel as any, { jwtSecret: JWT_SECRET, ...configOverrides })
  );
  app.use(defaultErrorHandler);
  return app;
}

describe('createAuthRouter — login', () => {
  it('returns a token for correct credentials', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const UserModel = createFakeModel('User', [
      { id: 'u1', email: 'a@b.com', password: hashed, role: 'user' },
    ]);
    const res = await request(buildApp(UserModel))
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.email).toBe('a@b.com');
  });

  it('rejects a wrong password with 401', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const UserModel = createFakeModel('User', [
      { id: 'u1', email: 'a@b.com', password: hashed, role: 'user' },
    ]);
    const res = await request(buildApp(UserModel))
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email with 401 (not 404 — no user enumeration)', async () => {
    const UserModel = createFakeModel('User', []);
    const res = await request(buildApp(UserModel))
      .post('/api/auth/login')
      .send({ email: 'nobody@b.com', password: 'whatever' });

    expect(res.status).toBe(401);
  });
});

describe('createAuthRouter — register', () => {
  const registerConfig = {
    register: {
      idPrefix: 'u',
      requiredFields: ['username'],
      extraFields: ['username'],
      defaults: { role: 'user' },
    },
  };

  it('creates a user with hashed password and default role', async () => {
    const UserModel = createFakeModel('User', []);
    const res = await request(buildApp(UserModel, registerConfig))
      .post('/api/auth/register')
      .send({ email: 'new@b.com', password: 'secret123', username: 'newbie' });

    expect(res.status).toBe(201);
    const created = UserModel.__rows[0];
    expect(created.role).toBe('user');
    expect(created.username).toBe('newbie');
    expect(created.password).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', created.password)).toBe(true);
  });

  it('rejects a missing requiredField with 400', async () => {
    const UserModel = createFakeModel('User', []);
    const res = await request(buildApp(UserModel, registerConfig))
      .post('/api/auth/register')
      .send({ email: 'new@b.com', password: 'secret123' }); // no username

    expect(res.status).toBe(400);
    expect(UserModel.__rows).toHaveLength(0);
  });

  it('rejects a duplicate email with 409', async () => {
    const UserModel = createFakeModel('User', [
      { id: 'u1', email: 'taken@b.com', password: 'x', username: 'existing' },
    ]);
    const res = await request(buildApp(UserModel, registerConfig))
      .post('/api/auth/register')
      .send({ email: 'taken@b.com', password: 'secret123', username: 'newbie' });

    expect(res.status).toBe(409);
    expect(UserModel.__rows).toHaveLength(1);
  });

  it('is not mounted when `register` is omitted', async () => {
    const UserModel = createFakeModel('User', []);
    const res = await request(buildApp(UserModel))
      .post('/api/auth/register')
      .send({ email: 'new@b.com', password: 'secret123' });

    expect(res.status).toBe(404);
  });
});

describe('createAuthRouter — changePassword', () => {
  async function loginAndGetToken(app: express.Express, email: string, password: string) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.token as string;
  }

  it('changes the password when the current one is correct', async () => {
    const hashed = await bcrypt.hash('old-password', 10);
    const UserModel = createFakeModel('User', [{ id: 'u1', email: 'a@b.com', password: hashed }]);
    const app = buildApp(UserModel, { changePassword: true });
    const token = await loginAndGetToken(app, 'a@b.com', 'old-password');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'old-password', newPassword: 'new-password' });

    expect(res.status).toBe(200);
    const updated = UserModel.__rows[0];
    expect(await bcrypt.compare('new-password', updated.password)).toBe(true);
  });

  it('rejects a wrong current password with 401 and leaves the password unchanged', async () => {
    const hashed = await bcrypt.hash('old-password', 10);
    const UserModel = createFakeModel('User', [{ id: 'u1', email: 'a@b.com', password: hashed }]);
    const app = buildApp(UserModel, { changePassword: true });
    const token = await loginAndGetToken(app, 'a@b.com', 'old-password');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'new-password' });

    expect(res.status).toBe(401);
    expect(UserModel.__rows[0].password).toBe(hashed);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const UserModel = createFakeModel('User', []);
    const res = await request(buildApp(UserModel, { changePassword: true }))
      .post('/api/auth/change-password')
      .send({ currentPassword: 'a', newPassword: 'b' });

    expect(res.status).toBe(401);
  });
});
