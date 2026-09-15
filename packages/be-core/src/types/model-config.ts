// The field and model vocabulary lives in @eleansphere/schema, so entity-core (which runs in the
// browser) can share it without depending on be-core. Re-exported here so existing
// `@eleansphere/be-core` type imports keep working.
export type {
  FieldType,
  StringFormat,
  FieldValidation,
  FieldConfig,
  ModelConfig,
  AccessPolicy,
  AccessConfig,
  FilterOperator,
  QueryConfig,
  IndexConfig,
} from '@eleansphere/schema';
