import request from 'supertest';
import jwt from 'jsonwebtoken';
import { QueryTypes } from 'sequelize';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ModelConfig } from '@eleansphere/schema';
import { createCore, CoreInstance, AppConfig } from '../app/create-app';
import { createTestSchema, TestSchema, TEST_DATABASE_URL } from '../test-utils/test-database';

const JWT_SECRET = 'references-integration-secret';

const userConfig: ModelConfig = {
  name: 'user',
  prefix: 'u_',
  skipAutoRoutes: true,
  fields: {
    email: { type: 'STRING', required: true },
    password: { type: 'STRING', required: true },
  },
};

const shelfConfig: ModelConfig = {
  name: 'shelf',
  prefix: 'sh_',
  userScoped: true,
  fields: { name: { type: 'STRING', required: true } },
};

/** Not owner-scoped: any existing genre may be referenced. */
const genreConfig: ModelConfig = {
  name: 'genre',
  prefix: 'gn_',
  fields: { name: { type: 'STRING', required: true } },
};

const bookConfig: ModelConfig = {
  name: 'book',
  prefix: 'bk_',
  userScoped: true,
  fields: {
    title: { type: 'STRING', required: true },
    shelfId: { type: 'STRING', references: { model: 'shelf', onDelete: 'SET NULL' } },
    genreId: { type: 'STRING', references: { model: 'genre' } },
  },
};

const loanConfig: ModelConfig = {
  name: 'loan',
  prefix: 'ln_',
  userScoped: true,
  fields: { bookId: { type: 'STRING', required: true, references: { model: 'book' } } },
};

const bearer = (userId: string) =>
  `Bearer ${jwt.sign({ id: userId, email: `${userId}@test.cz` }, JWT_SECRET)}`;

const ALICE = bearer('u_alice');
const BOB = bearer('u_bob');
const CAROL = bearer('u_carol');

describe('references against Postgres', () => {
  let testSchema: TestSchema;
  let core: CoreInstance;

  const config = (): AppConfig => ({
    databaseUrl: TEST_DATABASE_URL,
    dbSsl: false,
    schema: testSchema.name,
    jwtSecret: JWT_SECRET,
    modelConfigs: [userConfig, shelfConfig, genreConfig, bookConfig, loanConfig],
    auth: { modelName: 'user' },
  });

  const post = (path: string, token: string, body: Record<string, unknown>) =>
    request(core.app).post(path).set('Authorization', token).send(body);

  beforeAll(async () => {
    testSchema = await createTestSchema();
    core = await createCore(config());
    await core.models.user.bulkCreate(
      ['u_alice', 'u_bob', 'u_carol'].map((id) => ({ id, email: `${id}@test.cz`, password: 'x' }))
    );
  });

  afterAll(async () => {
    await core?.close();
    await testSchema?.drop();
  });

  it('creates foreign keys with the declared delete rules', async () => {
    const constraints = await core.sequelize.query<{
      table_name: string;
      column_name: string;
      delete_rule: string;
    }>(
      `SELECT kcu.table_name, kcu.column_name, rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = rc.constraint_name
        AND kcu.constraint_schema = rc.constraint_schema
       WHERE rc.constraint_schema = :schema`,
      { replacements: { schema: testSchema.name }, type: QueryTypes.SELECT }
    );
    const deleteRules = Object.fromEntries(
      constraints.map((row) => [`${row.table_name}.${row.column_name}`, row.delete_rule])
    );

    expect(deleteRules).toMatchObject({
      'loans.bookId': 'NO ACTION',
      'books.shelfId': 'SET NULL',
      'books.genreId': 'NO ACTION',
      'books.ownerId': 'CASCADE',
      'loans.ownerId': 'CASCADE',
      'shelves.ownerId': 'CASCADE',
    });
  });

  it('accepts only existing rows the caller owns', async () => {
    const { body: aliceBook } = await post('/api/books', ALICE, { title: 'Dune' });
    const { body: bobBook } = await post('/api/books', BOB, { title: 'Emma' });

    const foreign = await post('/api/loans', ALICE, { bookId: bobBook.id });
    expect(foreign.status).toBe(400);
    expect(foreign.body.issues).toEqual([
      { path: 'bookId', code: 'reference', params: { model: 'book' } },
    ]);
    expect((await post('/api/loans', ALICE, { bookId: 'bk_missing' })).status).toBe(400);

    const own = await post('/api/loans', ALICE, { bookId: aliceBook.id });
    expect(own.status).toBe(201);

    const moved = await request(core.app)
      .patch(`/api/loans/${own.body.id}`)
      .set('Authorization', ALICE)
      .send({ bookId: bobBook.id });
    expect(moved.status).toBe(400);
  });

  it('accepts any existing row of a model that is not owner-scoped', async () => {
    const { body: genre } = await post('/api/genres', ALICE, { name: 'Sci-fi' });

    expect((await post('/api/books', BOB, { title: 'Solaris', genreId: genre.id })).status).toBe(
      201
    );
    expect(
      (await post('/api/books', BOB, { title: 'Solaris', genreId: 'gn_missing' })).status
    ).toBe(400);
  });

  it('refuses to delete a referenced row, and clears a SET NULL reference', async () => {
    const { body: shelf } = await post('/api/shelfs', ALICE, { name: 'Favourites' });
    const { body: book } = await post('/api/books', ALICE, {
      title: 'Hyperion',
      shelfId: shelf.id,
    });
    await post('/api/loans', ALICE, { bookId: book.id });

    const deleteBook = await request(core.app)
      .delete(`/api/books/${book.id}`)
      .set('Authorization', ALICE);
    expect(deleteBook.status).toBe(409);

    const deleteShelf = await request(core.app)
      .delete(`/api/shelfs/${shelf.id}`)
      .set('Authorization', ALICE);
    expect(deleteShelf.status).toBe(204);

    const reloaded = await request(core.app)
      .get(`/api/books/${book.id}`)
      .set('Authorization', ALICE);
    expect(reloaded.body.shelfId).toBeNull();
  });

  it('deleting the owner removes their rows, restrict references included', async () => {
    const { body: book } = await post('/api/books', CAROL, { title: 'Stoner' });
    expect((await post('/api/loans', CAROL, { bookId: book.id })).status).toBe(201);

    await core.models.user.destroy({ where: { id: 'u_carol' } });

    expect(await core.models.book.count({ where: { ownerId: 'u_carol' } })).toBe(0);
    expect(await core.models.loan.count({ where: { ownerId: 'u_carol' } })).toBe(0);
  });

  it('refuses a required reference with onDelete SET NULL at startup', async () => {
    const invalidBook: ModelConfig = {
      ...bookConfig,
      fields: {
        title: { type: 'STRING', required: true },
        shelfId: {
          type: 'STRING',
          required: true,
          references: { model: 'shelf', onDelete: 'SET NULL' },
        },
      },
    };

    await expect(
      createCore({ ...config(), modelConfigs: [userConfig, shelfConfig, invalidBook] })
    ).rejects.toThrow(/SET NULL/);
  });
});
