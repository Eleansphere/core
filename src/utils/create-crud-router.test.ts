import express from 'express';
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

  it('gates POST/PUT/DELETE behind `protect`', async () => {
    const model = createFakeModel('Item', [{ id: '1', name: 'a' }]);
    const app = buildApp(model, { protect: [rejectAll] });

    expect((await request(app).post('/items').send({})).status).toBe(401);
    expect((await request(app).put('/items/1').send({})).status).toBe(401);
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
