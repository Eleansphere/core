import type { ModelConfig, FieldConfig } from '@eleansphere/be-core';
import { AbstractCrudService, AbstractFileService } from '@eleansphere/service-core';
import { AbstractUserScopedCrudService } from './services/abstract-user-scoped-crud.service';

// ── Field definitions ─────────────────────────────────────────────────────────

type FieldType = 'STRING' | 'TEXT' | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'DATE' | 'BLOB';

export type FieldDef = {
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
  [key: string]: unknown;
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

type EntityOptions<TFields extends Fields> = {
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
  /** Extend the generated service class with custom methods */
  extend?: (Base: AnyConstructor) => AnyConstructor;
};

export type EntityResult<TFields extends Fields> = {
  config: ModelConfig;
  Dto: DtoClass<InferDto<TFields>>;
  CreateDto: DtoClass<InferCreateDto<TFields>>;
  UpdateDto: DtoClass<InferUpdateDto<TFields>>;
  // Service is typed as `any` — callers cast via InstanceType<typeof entity.Service>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Service: any;
};

export function defineEntity<TFields extends Fields>(
  options: EntityOptions<TFields>
): EntityResult<TFields> {
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

  const Service = extend ? extend(ServiceBase) : ServiceBase;

  return { config, Dto, CreateDto, UpdateDto, Service };
}
