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

export interface FieldConfig extends FieldValidation {
  type: FieldType;
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
