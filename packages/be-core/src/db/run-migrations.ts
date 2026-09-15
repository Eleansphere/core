import { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

export interface MigrationContext {
  queryInterface: QueryInterface;
  sequelize: Sequelize;
  /**
   * The Postgres schema migrations run in (`AppConfig.schema`), if any. Pass it along with table
   * names — `queryInterface.addColumn({ tableName: 'books', schema }, …)` — since some
   * `QueryInterface` methods otherwise target `public` regardless of the connection's search path.
   */
  schema: string | undefined;
}

export interface Migration {
  /**
   * Unique and never renamed: it's what marks the migration as applied. Start with a sortable
   * date, e.g. `2026-09-15-create-books`.
   */
  name: string;
  up(context: MigrationContext): Promise<void>;
  down?(context: MigrationContext): Promise<void>;
}

export interface MigrationRunOptions {
  /** Postgres schema holding the tables; handed to every migration as `context.schema`. */
  schema?: string;
}

/** Table recording which migrations ran (in the configured Postgres schema). */
export const MIGRATIONS_TABLE = 'migrations';

function assertUniqueNames(migrations: readonly Migration[]): void {
  const seen = new Set<string>();
  for (const { name } of migrations) {
    if (seen.has(name)) throw new Error(`Duplicate migration name "${name}"`);
    seen.add(name);
  }
}

function createMigrator(
  sequelize: Sequelize,
  migrations: readonly Migration[],
  { schema }: MigrationRunOptions
) {
  assertUniqueNames(migrations);
  return new Umzug<MigrationContext>({
    migrations: migrations.map((migration) => ({
      name: migration.name,
      up: ({ context }) => migration.up(context),
      down: async ({ context }) => {
        if (!migration.down) throw new Error(`Migration "${migration.name}" has no down()`);
        await migration.down(context);
      },
    })),
    context: { queryInterface: sequelize.getQueryInterface(), sequelize, schema },
    storage: new SequelizeStorage({ sequelize, tableName: MIGRATIONS_TABLE }),
    logger: undefined,
  });
}

/** Applies, in array order, every migration not yet recorded. Resolves to the names applied. */
export async function runMigrations(
  sequelize: Sequelize,
  migrations: readonly Migration[],
  options: MigrationRunOptions = {}
): Promise<string[]> {
  const applied = await createMigrator(sequelize, migrations, options).up();
  return applied.map((migration) => migration.name);
}

/** Reverts the last `steps` applied migrations. Resolves to the names reverted. */
export async function revertMigrations(
  sequelize: Sequelize,
  migrations: readonly Migration[],
  { steps = 1, ...options }: MigrationRunOptions & { steps?: number } = {}
): Promise<string[]> {
  const reverted = await createMigrator(sequelize, migrations, options).down({ step: steps });
  return reverted.map((migration) => migration.name);
}
