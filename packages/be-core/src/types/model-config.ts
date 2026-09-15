export type FieldType = 'STRING' | 'TEXT' | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'DATE' | 'BLOB';

export interface FieldValidation {
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  format?: 'email' | 'url';
}

export interface FieldConfig extends FieldValidation {
  type: FieldType;
  default?: unknown;
  /** If true, the field is stripped from JSON responses (e.g. password hashes) */
  sensitive?: boolean;
  /**
   * If 'bcrypt', the field is hashed with bcrypt on create/update before the record is saved —
   * skipped when the incoming value already looks like a bcrypt hash, so re-submitting an
   * unchanged (already-hashed) value on update doesn't hash it twice.
   */
  hash?: 'bcrypt';
}

export interface ModelConfig {
  name: string;
  prefix: string;
  fields: Record<string, FieldConfig>;
  routePath?: string; // defaults to /api/${name}s
  log?: boolean;
  userScoped?: boolean; // if true, all routes require auth and getAll filters by ownerId
  skipAutoRoutes?: boolean; // if true, model is registered but no CRUD routes are mounted (use for models with custom plugin routes)
  /**
   * Mounts a public (no auth) `GET <routePath>/active` route returning records where
   * `from <= now <= to`, ordered by `from` ascending. Mounted even when `skipAutoRoutes` is set —
   * that flag only skips the CRUD routes, not this one — so a model can keep its admin CRUD
   * behind custom auth wiring in a plugin while still getting this generic public endpoint.
   */
  activeRange?: { from: string; to: string };
}
