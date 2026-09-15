import type {
  FieldType,
  FieldValidation,
  FilterOperator,
  IndexConfig,
  QueryConfig,
  RangeBound,
  ReferenceConfig,
} from '@eleansphere/schema';

// ── Field definitions ─────────────────────────────────────────────────────────

type BaseFieldDef = Omit<FieldValidation, 'required'> & {
  /** The literal `true` (written inline, or under `as const`), so the DTO types can see it. */
  required?: true;
  /**
   * Excluded from the read DTO (type and runtime `new Dto(data)`) and stripped from API responses
   * (be-core `sensitive`); still part of the create/update DTOs. For passwords and other secrets.
   */
  writeOnly?: true;
  /**
   * Server-managed: part of the read DTO, never of the create/update DTOs, and stripped by the
   * server from request bodies. E.g. a user's `role`.
   */
  readOnly?: true;
  default?: unknown;
  /** Hash with bcrypt server-side before saving. Typically paired with `writeOnly`. */
  hash?: 'bcrypt';
  /**
   * The field holds another entity's id: the server adds a foreign key and rejects ids that don't
   * exist or aren't the caller's (for a `userScoped` target). `onDelete` defaults to `RESTRICT`.
   */
  references?: ReferenceConfig;
};

/** One field. An `ENUM` must list its `values`; they become a union type in the DTOs. */
export type FieldDef = BaseFieldDef &
  (
    | { type: 'ENUM'; values: readonly [string, ...string[]] }
    | { type: Exclude<FieldType, 'ENUM'>; values?: never }
  );

export type Fields = Record<string, FieldDef>;

// ── Value types ───────────────────────────────────────────────────────────────

type FieldTypeMap = {
  STRING: string;
  TEXT: string;
  INTEGER: number;
  FLOAT: number;
  BOOLEAN: boolean;
  /** ISO timestamp, as JSON carries it. */
  DATE: string;
  /** `YYYY-MM-DD`. */
  DATEONLY: string;
  ENUM: string;
  BLOB: Blob;
};

// Compile-time guard: if schema's `FieldType` gains a member that `FieldTypeMap` doesn't cover,
// this stops compiling instead of silently typing a real field as `unknown`. Exported (but not
// re-exported from index) so it can't trip `noUnusedLocals`; not part of the public API.
type UnmappedFieldTypes = Exclude<FieldType, keyof FieldTypeMap>;
export const __fieldTypeMapIsExhaustive: [UnmappedFieldTypes] extends [never]
  ? true
  : UnmappedFieldTypes = true;

/** The value type of one field: its `values` union for an ENUM, else by column type. */
export type FieldValue<F extends FieldDef> = F extends {
  type: 'ENUM';
  values: readonly (infer Value)[];
}
  ? Value
  : FieldTypeMap[F['type']];

type Simplify<T> = { [K in keyof T]: T[K] } & unknown;

/** A row always has a value for a required field or one with a default; others may be `null`. */
type ReadValue<F extends FieldDef> = F extends { required: true }
  ? FieldValue<F>
  : F extends { default: unknown }
    ? FieldValue<F>
    : FieldValue<F> | null;

/** A client may clear (send `null`) only a field that isn't required. */
type WriteValue<F extends FieldDef> = F extends { required: true }
  ? FieldValue<F>
  : FieldValue<F> | null;

/** Must be sent on create: required and without a default to fall back to. */
type RequiredOnCreate<F extends FieldDef> = F extends { required: true }
  ? F extends { default: unknown }
    ? false
    : true
  : false;

type ReadableKeys<F extends Fields> = {
  [K in keyof F]: F[K] extends { writeOnly: true } ? never : K;
}[keyof F];

type WritableKeys<F extends Fields> = {
  [K in keyof F]: F[K] extends { readOnly: true } ? never : K;
}[keyof F];

// ── DTOs ──────────────────────────────────────────────────────────────────────

/** Columns the server adds to every row. */
export type SystemDtoFields = { id: string; createdAt: string; updatedAt: string };

/** Column the server adds to every row of a `userScoped` entity. */
export type OwnerDtoField = { ownerId: string };

/** A row as the API returns it (writeOnly fields excluded). */
export type InferDto<F extends Fields> = Simplify<
  SystemDtoFields & { [K in ReadableKeys<F>]: ReadValue<F[K]> }
>;

/** {@link InferDto}, plus `ownerId` when the entity is `userScoped`. */
export type EntityDto<F extends Fields, Owned extends boolean = false> = Owned extends true
  ? Simplify<InferDto<F> & OwnerDtoField>
  : InferDto<F>;

/** Create request body: required fields without a default must be sent (readOnly excluded). */
export type InferCreateDto<F extends Fields> = Simplify<
  {
    [K in WritableKeys<F> as RequiredOnCreate<F[K]> extends true ? K : never]: FieldValue<F[K]>;
  } & {
    [K in WritableKeys<F> as RequiredOnCreate<F[K]> extends true ? never : K]?: WriteValue<F[K]>;
  }
>;

/** Partial update request body (readOnly excluded). */
export type InferUpdateDto<F extends Fields> = Simplify<{
  [K in WritableKeys<F>]?: WriteValue<F[K]>;
}>;

// ── Query and indexes ─────────────────────────────────────────────────────────

/** Columns every row has; filterable and sortable once the query config lists them. */
export type SystemColumn = 'id' | 'createdAt' | 'updatedAt' | 'ownerId';

type ColumnOf<F extends Fields> = (keyof F & string) | SystemColumn;

/** be-core's `QueryConfig`, with column names checked against the entity's fields. */
export type EntityQuery<F extends Fields> = Omit<QueryConfig, 'filter' | 'sort' | 'search'> & {
  filter?: { readonly [K in ColumnOf<F>]?: FilterOperator };
  sort?: readonly ColumnOf<F>[];
  search?: readonly (keyof F & string)[];
};

/** be-core's `IndexConfig`, with column names checked against the entity's fields. */
export type EntityIndex<F extends Fields> = Omit<IndexConfig, 'fields' | 'where'> & {
  fields: readonly ColumnOf<F>[];
  where?: { readonly [K in ColumnOf<F>]?: string | number | boolean | null };
};

/** An entity without a query config. */
export type NoQuery = Record<never, never>;

export type RangeFilter<Value> = { [Bound in RangeBound]?: Value };
export type NullFilter = { isNull: boolean };

type ColumnValue<F extends Fields, Column> = Column extends keyof F
  ? FieldValue<F[Column]>
  : string;

type FilterValue<Operator, Value> = Operator extends 'eq'
  ? Value
  : Operator extends 'in'
    ? Value | readonly Value[]
    : Operator extends 'range'
      ? Value | RangeFilter<Value>
      : Operator extends 'isNull'
        ? NullFilter
        : never;

/** The filters a list request may send: exactly the columns and operators the query declares. */
export type ListFilters<F extends Fields, Q> = Q extends { filter: infer Filter }
  ? { [Column in keyof Filter]?: FilterValue<Filter[Column], ColumnValue<F, Column>> }
  : Record<string, never>;

type SortColumnOf<Q> = Q extends { sort: readonly (infer Column)[] } ? Column & string : never;

/** A sortable column, `-` prefixed for descending. */
export type SortTerm<Q> = SortColumnOf<Q> | `-${SortColumnOf<Q>}`;

export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Typed list request for one entity: filters, sort and search allowed by its query config. */
export type ListParams<F extends Fields, Q> = PaginationParams & {
  filter?: ListFilters<F, Q>;
  sort?: SortTerm<Q> | readonly SortTerm<Q>[];
  q?: string;
};
