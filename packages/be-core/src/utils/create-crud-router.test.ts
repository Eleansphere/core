import express, { RequestHandler } from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { describe, it, expect, vi } from 'vitest';
import { createCrudRouter } from './create-crud-router';
import { defaultErrorHandler } from '../app/error-handler';
import { createFakeModel } from '../test-utils/fake-model';
import type { CrudRouterOptions } from '../types/crud-router';

function buildApp(
  model: ReturnType<typeof createFakeModel>,
  options: Partial<CrudRouterOptions<any>> = {}
) {
  const app = express();
  app.use(express.json());
  app.use('/items', createCrudRouter({ model: model as any, ...options }));
  app.use(defaultErrorHandler);
  return app;
}

/** Stands in for token decoding: `x-user` header → `req.user`. */
const userFromHeader: RequestHandler = (req, _res, next) => {
  const header = req.headers['x-user'];
  if (typeof header === 'string') {
    const [id, role] = header.split(':');
    req.user = { id, email: `${id}@test.cz`, role };
  }
  next();
};

describe('createCrudRouter — hashFields', () => {
  it('hashes a plaintext value on create', async () => {
    const model = createFakeModel('Item', []);
    const app = buildApp(model, { hashFields: ['password'] });

    await request(app).post('/items').send({ password: 'plaintext' });

    expect(model.__rows[0].password).not.toBe('plaintext');
    expect(await bcrypt.compare('plaintext', model.__rows[0].password)).toBe(true);
  });

  it('does not double-hash a value that already looks like a bcrypt hash on update', async () => {
    const existingHash = await bcrypt.hash('plaintext', 10);
    const model = createFakeModel('Item', [{ id: '1', password: existingHash }]);
    const app = buildApp(model, { hashFields: ['password'] });

    await request(app).put('/items/1').send({ password: existingHash });

    expect(model.__rows[0].password).toBe(existingHash);
  });

  it('hashes a genuinely changed value on update', async () => {
    const oldHash = await bcrypt.hash('old', 10);
    const model = createFakeModel('Item', [{ id: '1', password: oldHash }]);
    const app = buildApp(model, { hashFields: ['password'] });

    await request(app).put('/items/1').send({ password: 'new-plaintext' });

    expect(model.__rows[0].password).not.toBe(oldHash);
    expect(await bcrypt.compare('new-plaintext', model.__rows[0].password)).toBe(true);
  });
});

describe('createCrudRouter — protect', () => {
  const rejectAll = (_req: any, res: any) => res.status(401).json({ error: 'nope' });

  it('leaves GET routes public even when `protect` is set', async () => {
    const model = createFakeModel('Item', [{ id: '1', name: 'a' }]);
    const app = buildApp(model, { protect: [rejectAll] });

    expect((await request(app).get('/items')).status).toBe(200);
    expect((await request(app).get('/items/1')).status).toBe(200);
  });

  it('gates POST/PUT/PATCH/DELETE behind `protect`', async () => {
    const model = createFakeModel('Item', [{ id: '1', name: 'a' }]);
    const app = buildApp(model, { protect: [rejectAll] });

    expect((await request(app).post('/items').send({})).status).toBe(401);
    expect((await request(app).put('/items/1').send({})).status).toBe(401);
    expect((await request(app).patch('/items/1').send({})).status).toBe(401);
    expect((await request(app).delete('/items/1')).status).toBe(401);
  });

  it('does not gate anything when `protect` is omitted (unchanged default behavior)', async () => {
    const model = createFakeModel('Item', []);
    const app = buildApp(model);

    expect((await request(app).post('/items').send({ name: 'a' })).status).toBe(201);
  });
});

describe('createCrudRouter — buildWhere', () => {
  it('filters the list using the request-derived where clause', async () => {
    const model = createFakeModel('Item', [
      { id: '1', category: 'a' },
      { id: '2', category: 'b' },
    ]);
    const app = buildApp(model, {
      buildWhere: (req) => (req.query.category ? { category: req.query.category } : {}),
    });

    const res = await request(app).get('/items').query({ category: 'a' });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('1');
  });
});

describe('createCrudRouter — enrich', () => {
  const enrich = async (rows: any[]) => rows.map((r) => ({ ...r.toJSON(), extra: true }));

  it('enriches every row in a list response', async () => {
    const model = createFakeModel('Item', [{ id: '1' }, { id: '2' }]);
    const res = await request(buildApp(model, { enrich })).get('/items');

    expect(res.body.data.every((row: any) => row.extra === true)).toBe(true);
  });

  it('enriches a single row in a get-by-id response', async () => {
    const model = createFakeModel('Item', [{ id: '1' }]);
    const res = await request(buildApp(model, { enrich })).get('/items/1');

    expect(res.body.extra).toBe(true);
  });

  it('enriches the created row in a create response', async () => {
    const model = createFakeModel('Item', []);
    const res = await request(buildApp(model, { enrich })).post('/items').send({ name: 'a' });

    expect(res.body.extra).toBe(true);
  });
});

describe('createCrudRouter — beforeDelete', () => {
  it('runs before the record is destroyed, and can still see it', async () => {
    const model = createFakeModel('Item', [{ id: '1' }]);
    const beforeDelete = vi.fn(async (entity: any) => {
      expect(entity.id).toBe('1');
    });

    const res = await request(buildApp(model, { beforeDelete })).delete('/items/1');

    expect(res.status).toBe(204);
    expect(beforeDelete).toHaveBeenCalledOnce();
    expect(model.__rows).toHaveLength(0);
  });
});

describe('createCrudRouter — body stripping', () => {
  it('never takes id, timestamps or readOnly fields from the client', async () => {
    const model = createFakeModel('Item', []);
    const app = buildApp(model, {
      prefix: 'it_',
      generateId: (prefix) => `${prefix}generated`,
      readOnlyFields: ['role'],
    });

    await request(app)
      .post('/items')
      .send({ id: 'chosen', createdAt: '2000-01-01', role: 'admin', name: 'a' });

    expect(model.__rows[0]).toEqual(expect.objectContaining({ id: 'it_generated', name: 'a' }));
    expect(model.__rows[0]).not.toHaveProperty('createdAt');
    expect(model.__rows[0]).not.toHaveProperty('role');
  });
});

describe('createCrudRouter — partial update', () => {
  it('PATCH changes only the fields sent; the hook sees those, and the row as stored', async () => {
    const model = createFakeModel('Item', [{ id: '1', name: 'a', color: 'red' }]);
    const beforeUpdate = vi.fn(async (data: Record<string, unknown>) => data);
    const app = buildApp(model, { hooks: { beforeUpdate } });

    const res = await request(app).patch('/items/1').send({ color: 'blue' });

    expect(res.status).toBe(200);
    expect(model.__rows[0]).toEqual(expect.objectContaining({ name: 'a', color: 'blue' }));
    expect(beforeUpdate).toHaveBeenCalledWith({ color: 'blue' }, expect.anything(), {
      id: '1',
      name: 'a',
      color: 'red',
    });
  });
});

describe('createCrudRouter — access', () => {
  it('owner: stamps the owner from the token, ignoring one sent in the body', async () => {
    const model = createFakeModel('Item', []);
    const app = buildApp(model, {
      authenticate: userFromHeader,
      access: { read: 'owner', write: 'owner' },
    });

    const res = await request(app)
      .post('/items')
      .set('x-user', 'u_alice')
      .send({ name: 'a', ownerId: 'u_bob' });

    expect(res.status).toBe(201);
    expect(model.__rows[0].ownerId).toBe('u_alice');
  });

  it('owner: lists only own rows and 404s on anyone else’s', async () => {
    const model = createFakeModel('Item', [
      { id: '1', ownerId: 'u_alice' },
      { id: '2', ownerId: 'u_bob' },
    ]);
    const app = buildApp(model, {
      authenticate: userFromHeader,
      access: { read: 'owner', write: 'owner' },
    });

    const list = await request(app).get('/items').set('x-user', 'u_alice');
    expect(list.body.data.map((row: any) => row.id)).toEqual(['1']);

    expect((await request(app).get('/items/2').set('x-user', 'u_alice')).status).toBe(404);
    expect((await request(app).patch('/items/2').set('x-user', 'u_alice').send({})).status).toBe(
      404
    );
    expect((await request(app).delete('/items/2').set('x-user', 'u_alice')).status).toBe(404);
    expect(model.__rows).toHaveLength(2);
  });

  it('owner: rejects anonymous callers with 401', async () => {
    const model = createFakeModel('Item', []);
    const app = buildApp(model, { authenticate: userFromHeader, userScoped: true });

    expect((await request(app).get('/items')).status).toBe(401);
  });

  it('roles: 403 for a signed-in user without the role', async () => {
    const model = createFakeModel('Item', []);
    const app = buildApp(model, {
      authenticate: userFromHeader,
      access: { read: 'public', write: 'admin' },
    });

    expect((await request(app).get('/items')).status).toBe(200);
    expect((await request(app).post('/items').set('x-user', 'u_alice:user')).status).toBe(403);
    expect((await request(app).post('/items').set('x-user', 'u_root:admin')).status).toBe(201);
  });

  it('function rule: false denies, a where-object scopes the rows', async () => {
    const model = createFakeModel('Item', [
      { id: '1', visibility: 'public' },
      { id: '2', visibility: 'private' },
    ]);
    const app = buildApp(model, {
      authenticate: userFromHeader,
      access: {
        read: () => ({ visibility: 'public' }),
        write: (req) => req.user?.role === 'admin',
      },
    });

    const list = await request(app).get('/items');
    expect(list.body.data.map((row: any) => row.id)).toEqual(['1']);
    expect((await request(app).get('/items/2')).status).toBe(404);
    expect((await request(app).post('/items')).status).toBe(401);
    expect((await request(app).post('/items').set('x-user', 'u_alice:user')).status).toBe(403);
  });
});
