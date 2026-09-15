import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ModelConfig } from '@eleansphere/schema';
import { createCore, CoreInstance } from '../app/create-app';
import { MemoryStorageAdapter } from './storage/memory-storage-adapter';
import { defaultFileAuthorizer, FileAuthorizer } from './file-access';
import { createTestSchema, TestSchema, TEST_DATABASE_URL } from '../test-utils/test-database';

const JWT_SECRET = 'files-integration-secret';
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PUBLIC_BASE_URL = 'https://cdn.test';

const bookConfig: ModelConfig = {
  name: 'book',
  prefix: 'bk_',
  userScoped: true,
  fields: { title: { type: 'STRING', required: true } },
};

const bearer = (userId: string) =>
  `Bearer ${jwt.sign({ id: userId, email: `${userId}@test.cz` }, JWT_SECRET)}`;

const ALICE = bearer('u_alice');
const BOB = bearer('u_bob');

interface UploadOptions {
  token?: string;
  fields?: Record<string, string>;
  contentType?: string;
  filename?: string;
}

describe('file service against Postgres', () => {
  let testSchema: TestSchema;
  let core: CoreInstance;
  const storage = new MemoryStorageAdapter(PUBLIC_BASE_URL);

  // A book's files may only be attached by the book's owner; everything else as by default.
  const authorize: FileAuthorizer = async (access) => {
    if (access.action !== 'create' || access.refType !== 'book') {
      return defaultFileAuthorizer(access);
    }
    const userId = access.req.user?.id;
    if (!userId) return false;
    return (await core.models.book.count({ where: { id: access.refId, ownerId: userId } })) > 0;
  };

  function upload({ token, fields = {}, contentType = 'image/png', filename }: UploadOptions) {
    let call = request(core.app).post('/api/files');
    if (token) call = call.set('Authorization', token);
    for (const [name, value] of Object.entries(fields)) call = call.field(name, value);
    return call.attach('file', PNG_SIGNATURE, {
      filename: filename ?? 'image.png',
      contentType,
    });
  }

  const createBook = async (token: string) =>
    (await request(core.app).post('/api/books').set('Authorization', token).send({ title: 'Dune' }))
      .body as { id: string };

  beforeAll(async () => {
    testSchema = await createTestSchema();
    core = await createCore({
      databaseUrl: TEST_DATABASE_URL,
      dbSsl: false,
      schema: testSchema.name,
      jwtSecret: JWT_SECRET,
      modelConfigs: [bookConfig],
      storage: { adapter: storage, authorize, singleRoles: ['cover'] },
    });
  });

  afterAll(async () => {
    await core?.close();
    await testSchema?.drop();
  });

  it('refuses anonymous uploads and types outside the allowlist', async () => {
    expect((await upload({ fields: { refType: 'user' } })).status).toBe(401);

    const svg = await upload({ token: ALICE, contentType: 'image/svg+xml', filename: 'x.svg' });
    expect(svg.status).toBe(400);
  });

  it("lets only a book's owner attach files to it", async () => {
    const book = await createBook(ALICE);
    const cover = { refType: 'book', refId: book.id, role: 'cover' };

    expect((await upload({ token: BOB, fields: cover })).status).toBe(403);
    expect((await upload({ token: ALICE, fields: cover })).status).toBe(201);
  });

  it('keeps a single file per single role, replacing the previous one', async () => {
    const book = await createBook(ALICE);
    const cover = { refType: 'book', refId: book.id, role: 'cover' };

    const first = await upload({ token: ALICE, fields: cover });
    const second = await upload({ token: ALICE, fields: cover });

    const covers = await request(core.app).get('/api/files').query(cover);
    expect(covers.body.data.map((file: { id: string }) => file.id)).toEqual([second.body.id]);
    expect(storage.objects.has(first.body.storageKey)).toBe(false);
    expect(storage.objects.has(second.body.storageKey)).toBe(true);
  });

  it('serves a private file only to its uploader', async () => {
    const document = await upload({
      token: ALICE,
      fields: { refType: 'user', refId: 'u_alice', role: 'document', visibility: 'private' },
    });
    const fileUrl = `/api/files/${document.body.id}`;

    expect((await request(core.app).get(fileUrl)).status).toBe(404);
    expect((await request(core.app).get(fileUrl).set('Authorization', BOB)).status).toBe(404);
    expect((await request(core.app).get(`${fileUrl}/meta`).set('Authorization', BOB)).status).toBe(
      404
    );
    const listedForBob = await request(core.app)
      .get('/api/files')
      .set('Authorization', BOB)
      .query({ refType: 'user', refId: 'u_alice' });
    expect(listedForBob.body.data).toEqual([]);

    const own = await request(core.app).get(fileUrl).set('Authorization', ALICE);
    expect(own.status).toBe(200);
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['content-length']).toBe(String(PNG_SIGNATURE.length));
  });

  it('redirects a public file to its CDN URL', async () => {
    const avatar = await upload({ token: ALICE, fields: { refType: 'user', refId: 'u_alice' } });

    const res = await request(core.app).get(`/api/files/${avatar.body.id}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PUBLIC_BASE_URL}/${avatar.body.storageKey}`);
  });

  it('deletes a file only for its uploader', async () => {
    const photo = await upload({ token: ALICE, fields: { refType: 'user', refId: 'u_alice' } });
    const fileUrl = `/api/files/${photo.body.id}`;

    expect((await request(core.app).delete(fileUrl)).status).toBe(404);
    expect((await request(core.app).delete(fileUrl).set('Authorization', BOB)).status).toBe(404);
    expect((await request(core.app).delete(fileUrl).set('Authorization', ALICE)).status).toBe(204);
    expect(storage.objects.has(photo.body.storageKey)).toBe(false);
  });
});
