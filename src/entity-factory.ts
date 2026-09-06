import type { ModelConfig, FieldConfig, FieldType, FieldValidation } from '@eleansphere/be-core';
import { AbstractCrudService, AbstractFileService } from '@eleansphere/service-core';
import type { PaginationParams, PaginatedResponse } from '@eleansphere/service-core';
import { AbstractUserScopedCrudService } from './services/abstract-user-scoped-crud.service';

// ── Field definitions ─────────────────────────────────────────────────────────

/**
 * A single field's definition. Built directly on be-core's `FieldValidation` and `FieldType`, so
 * the two can't drift: every validation be-core understands (`unique`, `minLength`, `maxLength`,
 * `min`, `max`, `format`) is accepted here and type-checked — instead of being waved through an
 * untyped `[key: string]: unknown` index signature like before. be-core owns the vocabulary;
 * entity-core depends on it (type-only import — no runtime/bundle cost).
 */
export type FieldDef = Omit<FieldValidation, 'required'> & {
  type: FieldType;
  /** Use `required: true` (literal). Prevents TypeScript from widening to `boolean`. */
  required?: true;
  /**
   * Excluded from the read Dto (TS type AND stripped at runtime from `new Dto(data)`), and
   * from the JSON response the backend actually sends (be-core `sensitive`, applied
   * automatically — no need to also set `sensitive` yourself). Still present in CreateDto /
   * UpdateDto, since e.g. a password has to be submittable on create/update.
   * Use for anything that should never round-trip back to a client: passwords, tokens, blobs
   * you only ever write.
   */
  writeOnly?: true;
  default?: unknown;
};

export type Fields = Record<string, FieldDef>;

// ── Type inference ────────────────────────────────────────────────────────────

type FieldTypeMap = {
  STRING: string;
  TEXT: string;
  INTEGER: number;
  FLOAT: number;
  BOOLEAN: boolean;
  DATE: string;
  BLOB: Blob;
};

// Compile-time guard: if be-core's `FieldType` gains a member that `FieldTypeMap` doesn't cover,
// this assignment stops compiling — so the inference below fails loudly at build time instead of
// silently degrading a real field to `unknown`. Exported (but not re-exported from index) so it
// can't trip `noUnusedLocals`; it is not part of the public API.
type UnmappedFieldTypes = Exclude<FieldType, keyof FieldTypeMap>;
export const __fieldTypeMapIsExhaustive: [UnmappedFieldTypes] extends [never]
  ? true
  : UnmappedFieldTypes = true;

type MapType<F extends FieldDef> = FieldTypeMap[F['type']];

// Required in read Dto if: required:true OR has a default value
type RequiredInDto<F extends FieldDef> = F extends { required: true }
  ? true
  : F extends { default: unknown }
    ? true
    : false;

/** Inferred read DTO — excludes writeOnly fields */
export type InferDto<F extends Fields> = { id: string; createdAt?: string; updatedAt?: string } & {
  [K in keyof F as F[K] extends { writeOnly: true } ? never : K]: RequiredInDto<F[K]> extends true
    ? MapType<F[K]>
    : MapType<F[K]> | undefined;
};

/** Inferred create DTO — all fields present, respects required */
export type InferCreateDto<F extends Fields> = {
  [K in keyof F]: F[K] extends { required: true } ? MapType<F[K]> : MapType<F[K]> | undefined;
};

/** Inferred update DTO — all fields optional */
export type InferUpdateDto<F extends Fields> = {
  [K in keyof F]?: MapType<F[K]>;
};

// ── DTO class factory ─────────────────────────────────────────────────────────

export type DtoClass<T> = new (data?: Partial<T>) => T;

/**
 * `stripKeys` are deleted from the constructed instance after assignment — used for the read
 * Dto so a `writeOnly` field (e.g. password) can never survive a `new Dto(rawApiResponse)` call
 * even if it were ever present in the response data, regardless of what the TS type claims.
 * CreateDto/UpdateDto are built with no strip keys, since writeOnly fields must round-trip there.
 */
function makeDtoClass<T>(stripKeys: string[] = []): DtoClass<T> {
  return class {
    constructor(data: Partial<T> = {} as Partial<T>) {
      Object.assign(this, data);
      for (const key of stripKeys) delete (this as Record<string, unknown>)[key];
    }
  } as unknown as DtoClass<T>;
}

// ── ModelConfig field translation ─────────────────────────────────────────────

/**
 * Translates entity-core's `writeOnly` into be-core's `sensitive` (the flag be-core actually
 * checks at runtime to strip a field from JSON responses), and drops `writeOnly` itself before
 * handing the field to be-core's `ModelConfig`, which doesn't know that key. This is the single
 * place that keeps "excluded from the Dto" and "stripped from the real API response" in sync —
 * previously these were two separate, easy-to-desync flags (writeOnly vs sensitive) that a
 * consumer had to remember to set both of.
 */
function toModelConfigFields(fields: Fields): Record<string, FieldConfig> {
  const result: Record<string, FieldConfig> = {};
  for (const [key, field] of Object.entries(fields)) {
    const { writeOnly, ...rest } = field;
    result[key] = (writeOnly ? { ...rest, sensitive: true } : rest) as FieldConfig;
  }
  return result;
}

// ── defineEntity ──────────────────────────────────────────────────────────────

type AnyConstructor = abstract new (...args: any[]) => any;

/** A service constructor as instantiated by `createServiceContainer` / a project container. */
type ServiceCtor<TInstance> = new (baseUrl: string, tokenProvider: () => string | null) => TInstance;

/**
 * The public CRUD surface of a generated service — what `InstanceType<typeof entity.Service>` is
 * for a normal entity. Declared structurally (not as `AbstractCrudService<…>` directly) so it
 * stays non-abstract and `new`-able.
 */
export type CrudServiceInstance<TFields extends Fields> = {
  getAll(params?: PaginationParams): Promise<PaginatedResponse<InferDto<TFields>>>;
  getById(id: string): Promise<InferDto<TFields>>;
  create(data: InferCreateDto<TFields>): Promise<InferDto<TFields>>;
  update(id: string, data: InferUpdateDto<TFields>): Promise<InferDto<TFields>>;
  delete(id: string): Promise<void>;
};

type EntityOptions<TFields extends Fields, TServiceCtor extends AnyConstructor> = {
  name: string;
  prefix: string;
  /** HTTP base path used by the service. Defaults to /api/{name}s */
  basePath?: string;
  /** Override route path in be-core model config when it differs from basePath */
  routePath?: string;
  userScoped?: boolean;
  serviceType?: 'crud' | 'file';
  uploadField?: string;
  fields: TFields;
  /**
   * Extend the generated service class with custom methods. `Base` is the runtime service class
   * (an `AbstractCrudService` subclass); use `class extends (Base as any)` + `(this as any)` for
   * the HTTP helpers. The returned constructor's instance type becomes
   * `InstanceType<typeof entity.Service>`.
   */
  extend?: (Base: AnyConstructor) => TServiceCtor;
};

export type EntityResult<
  TFields extends Fields,
  TServiceCtor extends AnyConstructor = ServiceCtor<CrudServiceInstance<TFields>>,
> = {
  config: ModelConfig;
  Dto: DtoClass<InferDto<TFields>>;
  CreateDto: DtoClass<InferCreateDto<TFields>>;
  UpdateDto: DtoClass<InferUpdateDto<TFields>>;
  /**
   * The generated service class. `InstanceType<typeof entity.Service>` is the CRUD surface
   * (`getAll` / `getById` / `create` / `update` / `delete`) plus whatever `extend` added.
   * `serviceType: 'file'` entities keep a loose `Service` type (legacy path).
   */
  Service: TServiceCtor;
};

// Overload 1 — `serviceType: 'file'` (legacy blob-upload path): `Service` stays loose (`any`).
export function defineEntity<TFields extends Fields>(
  options: EntityOptions<TFields, ServiceCtor<any>> & { serviceType: 'file' }
): EntityResult<TFields, ServiceCtor<any>>;

// Overload 2 — normal CRUD entity (default). `TServiceCtor` is inferred from `extend`'s return,
// otherwise the plain CRUD service constructor. Entities that use `extend` should be instantiated
// via `createServiceContainer`, not `new entity.Service(...)` directly (the `(Base as any)` in the
// extend body erases the constructor signature).
export function defineEntity<
  TFields extends Fields,
  TServiceCtor extends AnyConstructor = ServiceCtor<CrudServiceInstance<TFields>>,
>(
  options: EntityOptions<TFields, TServiceCtor>
): EntityResult<TFields, TServiceCtor>;

export function defineEntity<TFields extends Fields>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: EntityOptions<TFields, any>
): EntityResult<TFields, AnyConstructor> {
  const { name, prefix, basePath, routePath, userScoped, serviceType, uploadField, fields, extend } =
    options;

  const path = basePath ?? `/api/${name}s`;

  // ── Model config ────────────────────────────────────────────────────────────
  const config = {
    name,
    prefix,
    ...(routePath != null && { routePath }),
    ...(userScoped != null && { userScoped }),
    fields: toModelConfigFields(fields),
  } satisfies ModelConfig;

  // ── DTO classes ─────────────────────────────────────────────────────────────
  const writeOnlyKeys = Object.entries(fields)
    .filter(([, field]) => field.writeOnly)
    .map(([key]) => key);

  const Dto = makeDtoClass<InferDto<TFields>>(writeOnlyKeys);
  const CreateDto = makeDtoClass<InferCreateDto<TFields>>();
  const UpdateDto = makeDtoClass<InferUpdateDto<TFields>>();

  // ── Service class ───────────────────────────────────────────────────────────
  let ServiceBase: AnyConstructor;

  if (serviceType === 'file') {
    const filePath = path;
    const fileField = uploadField ?? 'file';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ServiceBase = class extends (AbstractFileService as any) {
      protected readonly basePath = filePath;
      protected readonly uploadField = fileField;
    } as AnyConstructor;
  } else if (userScoped) {
    const crudPath = path;
    ServiceBase = class extends AbstractUserScopedCrudService<
      InferDto<TFields>,
      InferCreateDto<TFields>,
      InferUpdateDto<TFields>
    > {
      protected readonly basePath = crudPath;
    } as unknown as AnyConstructor;
  } else {
    const crudPath = path;
    ServiceBase = class extends AbstractCrudService<
      InferDto<TFields>,
      InferCreateDto<TFields>,
      InferUpdateDto<TFields>
    > {
      protected readonly basePath = crudPath;
    } as unknown as AnyConstructor;
  }

  // `extend` is typed to receive a real `ServiceCtor`; at runtime `ServiceBase` is exactly that,
  // but the three branches above are cast to `AnyConstructor`, so re-cast here.
  const Service = extend
    ? (extend as (base: AnyConstructor) => AnyConstructor)(ServiceBase)
    : ServiceBase;

  return { config, Dto, CreateDto, UpdateDto, Service } as EntityResult<TFields, AnyConstructor>;
}
