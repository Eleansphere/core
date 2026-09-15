import crypto from 'crypto';
import { createSequelize } from '../db/create-sequelize';

/** Local default matches the repository's docker-compose.yml; CI sets its own URL. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://core:core@localhost:5433/core_test';

const SCHEMA_NAME_RANDOM_BYTES = 6;

export interface TestSchema {
  name: string;
  drop: () => Promise<void>;
}

/**
 * Creates a throwaway Postgres schema, so test files can run in parallel against one database
 * and leave nothing behind. Pass `name` as `AppConfig.schema`.
 */
export async function createTestSchema(): Promise<TestSchema> {
  const name = `test_${crypto.randomBytes(SCHEMA_NAME_RANDOM_BYTES).toString('hex')}`;
  const connection = createSequelize({ databaseUrl: TEST_DATABASE_URL, ssl: false });
  await connection.query(`CREATE SCHEMA "${name}"`);
  return {
    name,
    drop: async () => {
      await connection.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
      await connection.close();
    },
  };
}
