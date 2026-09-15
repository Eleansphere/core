import type { FieldConfig, FieldType } from './field-config';
import { isDateOnly } from './dates';

/**
 * Machine-readable reason a value was rejected. Clients translate these (with `params`) instead of
 * showing server-written English text.
 */
export type ValidationIssueCode =
  | 'required'
  | 'type'
  | 'enum'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'format'
  /** Server-side: another row already has this value. */
  | 'unique'
  /** Server-side: the referenced row doesn't exist or isn't the caller's. */
  | 'reference';

export interface ValidationIssue {
  /** Name of the offending field. */
  path: string;
  code: ValidationIssueCode;
  /** Values the message needs, e.g. `{ minLength: 3 }`. */
  params?: Record<string, unknown>;
}

/**
 * - `create`: every writable field is checked, and missing required fields are reported.
 * - `patch`: only the fields present in the data are checked (a partial update).
 */
export type ValidationMode = 'create' | 'patch';

export interface ValidateFieldsOptions {
  mode: ValidationMode;
}

type FieldProblem = Omit<ValidationIssue, 'path'>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_URL_PROTOCOLS = ['http:', 'https:'];

const MATCHES_TYPE: Record<FieldType, (value: unknown) => boolean> = {
  STRING: isString,
  TEXT: isString,
  INTEGER: (value) => Number.isInteger(value),
  FLOAT: (value) => typeof value === 'number' && Number.isFinite(value),
  BOOLEAN: (value) => typeof value === 'boolean',
  DATE: isTimestamp,
  DATEONLY: isDateOnly,
  ENUM: isString,
  BLOB: () => true,
};

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isTimestamp(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isWebUrl(value: string): boolean {
  try {
    return WEB_URL_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** `undefined`, `null` and `''` all count as "no value". */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isMissingRequired(field: FieldConfig, value: unknown, mode: ValidationMode): boolean {
  if (!field.required) return false;
  // A required field left out of a create falls back to its default, when it has one.
  const fallsBackToDefault =
    mode === 'create' && value === undefined && field.default !== undefined;
  return !fallsBackToDefault;
}

function checkType(field: FieldConfig, value: unknown): FieldProblem | undefined {
  if (!MATCHES_TYPE[field.type](value)) {
    return { code: 'type', params: { type: field.type } };
  }
  if (field.type === 'ENUM' && !(field.values ?? []).includes(value as string)) {
    return { code: 'enum', params: { values: field.values ?? [] } };
  }
  return undefined;
}

function checkStringConstraints(field: FieldConfig, value: string): FieldProblem | undefined {
  if (field.minLength !== undefined && value.length < field.minLength) {
    return { code: 'minLength', params: { minLength: field.minLength } };
  }
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    return { code: 'maxLength', params: { maxLength: field.maxLength } };
  }
  if (field.format === 'email' && !EMAIL_PATTERN.test(value)) {
    return { code: 'format', params: { format: 'email' } };
  }
  if (field.format === 'url' && !isWebUrl(value)) {
    return { code: 'format', params: { format: 'url' } };
  }
  return undefined;
}

function checkNumberConstraints(field: FieldConfig, value: number): FieldProblem | undefined {
  if (field.min !== undefined && value < field.min) {
    return { code: 'min', params: { min: field.min } };
  }
  if (field.max !== undefined && value > field.max) {
    return { code: 'max', params: { max: field.max } };
  }
  return undefined;
}

function checkConstraints(field: FieldConfig, value: unknown): FieldProblem | undefined {
  if (typeof value === 'string') return checkStringConstraints(field, value);
  if (typeof value === 'number') return checkNumberConstraints(field, value);
  return undefined;
}

function findFieldProblem(
  field: FieldConfig,
  value: unknown,
  mode: ValidationMode
): FieldProblem | undefined {
  if (isEmptyValue(value)) {
    return isMissingRequired(field, value, mode) ? { code: 'required' } : undefined;
  }
  return checkType(field, value) ?? checkConstraints(field, value);
}

/**
 * Checks `data` against the field rules and returns every problem found (empty when valid).
 * `readOnly` fields are skipped: they're server-managed and never come from a client. Keys not
 * declared in `fields` are ignored here; stripping them is the server's job.
 *
 * The same function runs in be-core (request validation) and in the browser (entity-core's
 * `toStandardSchema`), so a form and the API can never disagree about what is valid.
 */
export function validateFields(
  fields: Record<string, FieldConfig>,
  data: Record<string, unknown>,
  { mode }: ValidateFieldsOptions
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [name, field] of Object.entries(fields)) {
    if (field.readOnly) continue;
    const isPresent = Object.prototype.hasOwnProperty.call(data, name);
    if (mode === 'patch' && !isPresent) continue;
    const problem = findFieldProblem(field, data[name], mode);
    if (problem) issues.push({ path: name, ...problem });
  }
  return issues;
}
