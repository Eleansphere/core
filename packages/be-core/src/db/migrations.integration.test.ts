import { DataTypes, QueryTypes } from 'sequelize';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ModelConfig } from '@eleansphere/schema';
import { createCore, AppConfig } from '../app/create-app';
import { Migration, revertMigrations } from './run-migrations';
import { createTestSchema, TestSchema, TEST_DATABASE_URL } from '../test-utils/test-database';

const noteConfig: ModelConfig = {
  name: 'note',
  prefix: 'nt_',
  skipAutoRoutes: true,
  fields: { text: { type: 'TEXT', required: true } },
};

const CREATE_NOTES = '2026-09-15-create-notes';
const ADD_PINNED = '2026-09-16-add-note-pinned';
const NOTES_TABLE = 'notes';

const migrations: Migration[] = [
  {
    name: CREATE_NOTES,
    async up({ queryInterface, schema }) {
      await queryInterface.createTable(
        { tableName: NOTES_TABLE, schema },
        {
          id: { type: DataTypes.STRING, primaryKey: true },
          text: { type: DataTypes.TEXT, allowNull: false },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        }
      );
    },
    async down({ queryInterface, schema }) {
      await queryInterface.dropTable({ tableName: NOTES_TABLE, schema });
    },
  },
  {
    name: ADD_PINNED,
    async up({ queryInterface, schema }) {
      await queryInterface.addColumn({ tableName: NOTES_TABLE, schema }, 'pinned', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    },
    async down({ queryInterface, schema }) {
      await queryInterface.removeColumn({ tableName: NOTES_TABLE, schema }, 'pinned');
    },
  },
];

describe('migrations against Postgres', () => {
  let testSchema: TestSchema;

  const config = (pending: Migration[]): AppConfig => ({
    databaseUrl: TEST_DATABASE_URL,
    dbSsl: false,
    schema: testSchema.name,
    jwtSecret: 'migrations-secret',
    modelConfigs: [noteConfig],
    syncMode: 'migrate',
    migrations: pending,
  });

  beforeAll(async () => {
    testSchema = await createTestSchema();
  });

  afterAll(async () => {
    await testSchema?.drop();
  });

  it('applies each pending migration once, in order, and can revert', async () => {
    const first = await createCore(config(migrations.slice(0, 1)));
    await first.models.note.create({ id: 'nt_1', text: 'Written before the second migration' });
    await first.close();

    const second = await createCore(config(migrations));
    try {
      const applied = await second.sequelize.query<{ name: string }>(
        'SELECT name FROM migrations ORDER BY name',
        { type: QueryTypes.SELECT }
      );
      expect(applied.map((row) => row.name)).toEqual([CREATE_NOTES, ADD_PINNED]);

      const [note] = await second.sequelize.query<{ pinned: boolean }>('SELECT pinned FROM notes', {
        type: QueryTypes.SELECT,
      });
      expect(note.pinned).toBe(false);

      const reverted = await revertMigrations(second.sequelize, migrations, {
        schema: testSchema.name,
      });
      expect(reverted).toEqual([ADD_PINNED]);
    } finally {
      await second.close();
    }
  });

  it('refuses migrations that would never run', async () => {
    await expect(createCore({ ...config(migrations), syncMode: 'create' })).rejects.toThrow(
      /syncMode/
    );
  });
});
