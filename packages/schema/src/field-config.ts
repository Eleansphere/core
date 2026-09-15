/**
 * Column types a field can declare.
 *
 * - `ENUM` is stored as a plain VARCHAR and validated against the field's `values`. A native
 *   Postgres enum would turn every added value into an `ALTER TYPE` migration.
 * - `DATEONLY` is a calendar date (`YYYY-MM-DD`) with no time and no time zone; `DATE` is a
 *   timestamp.
 */
export type FieldType =
  'STRING' | 'TEXT' | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'DATE' | 'DATEONLY' | 'ENUM' | 'BLOB';

export type StringFormat = 'email' | 'url';

export interface FieldValidation {
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** `url` accepts only absolute `http:` / `https:` URLs. */
  format?: StringFormat;
}

/**
 * What happens to referencing rows when the referenced row is deleted.
 *
 * - `RESTRICT` (default): the delete is refused while references exist (checked at the end of the
 *   statement, so a delete that also removes the referencing rows, like an account deletion
 *   cascading to both, still works)
 * - `CASCADE`: referencing rows are deleted too
 * - `SET NULL`: the reference is cleared; the field must not be `required`
 */
export type ReferenceAction = 'RESTRICT' | 'CASCADE' | 'SET NULL';

export interface ReferenceConfig {
  /** `ModelConfig.name` of the referenced model. */
  model: string;
  onDelete?: ReferenceAction;
}

export interface FieldConfig extends FieldValidation {
  type: FieldType;
  /**
   * The field holds the id of another model's row: be-core adds a foreign key and rejects, on
   * create and update, ids that don't exist or that belong to someone else (for an owner-scoped
   * target) with a `reference` issue.
   */
  references?: ReferenceConfig;
  /** Allowed values of an `ENUM` field. */
  values?: readonly string[];
  default?: unknown;
  /** Stripped from JSON responses, e.g. password hashes. */
  sensitive?: boolean;
  /**
   * Hashed with bcrypt before the record is saved. A value that already looks like a bcrypt hash
   * is left alone, so re-submitting an unchanged hash doesn't hash it twice.
   */
  hash?: 'bcrypt';
  /**
   * Server-managed: never accepted from a request body (stripped on create and update, skipped by
   * validation), but still returned in responses. E.g. a user's `role`, a `lastReminderSentAt`.
   */
  readOnly?: boolean;
}

/** Columns every model gets automatically. Never accepted from a request body. */
export const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt'] as const;

/** Column an owner-scoped model gets automatically; stamped from the caller's token on create. */
export const OWNER_FIELD = 'ownerId';
