import { Sequelize } from 'sequelize';

export interface DbConfig {
  databaseUrl: string;
  schema?: string;
  logging?: boolean;
  /** Whether to connect over SSL. Defaults to true; set false for local dev databases without SSL. */
  ssl?: boolean;
}

export function createSequelize(config: DbConfig): Sequelize {
  const sequelizeOptions: ConstructorParameters<typeof Sequelize>[1] = {
    dialect: 'postgres',
    logging: config.logging ?? false,
  };

  if (config.ssl ?? true) {
    sequelizeOptions.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    };
  }

  if (config.schema) {
    sequelizeOptions.define = { schema: config.schema };
    sequelizeOptions.dialectOptions = {
      ...(sequelizeOptions.dialectOptions as Record<string, unknown> | undefined),
      options: `-c search_path=${config.schema},public`,
    };
  }

  return new Sequelize(config.databaseUrl, sequelizeOptions);
}
