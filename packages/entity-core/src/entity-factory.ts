import type { AccessConfig, IndexConfig, ModelConfig, QueryConfig } from '@eleansphere/schema';
import type { ApiClient } from './http/api-client';
import type { AccessTokenSource } from './http/http-transport';
import { CrudServiceBase } from './services/crud.service';
import type { PaginatedResponse } from './services/list-request';
import type {
  EntityDto,
  EntityIndex,
  EntityQuery,
  Fields,
  InferCreateDto,
  InferUpdateDto,
  ListParams,
  NoQuery,
} from './entity-types';
import { toFieldConfigs } from './field-configs';

// ── DTO class factory ─────────────────────────────────────────────────────────

export type DtoClass<T> = new (data?: Partial<T>) => T;

/**
 * `stripKeys` are deleted from the constructed instance after assignment — used for the read
 * Dto so a `writeOnly` field (e.g. password) can never survive a `new Dto(rawApiResponse)` call
 * even if it were ever present in the response data, regardless of what the TS type claims.
 */
function makeDtoClass<T>(stripKeys: string[] = []): DtoClass<T> {
  return class {
    constructor(data: Partial<T> = {} as Partial<T>) {
      Object.assign(this, data);
      for (const key of stripKeys) delete (this as Record<string, unknown>)[key];
    }
  } as unknown as DtoClass<T>;
}

// ── Services ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = abstract new (...args: any[]) => any;

/** A service constructor as instantiated by `createServiceContainer` / a project container. */
type ServiceCtor<Instance> = new (baseUrl: string, tokenSource: AccessTokenSource) => Instance;

/**
 * The public CRUD surface of a generated service — what `InstanceType<typeof entity.Service>` is
 * for a normal entity. Declared structurally (not as `CrudServiceBase<…>` directly) so it
 * stays non-abstract and `new`-able.
 */
export type CrudServiceInstance<
  TFields extends Fields,
  TOwned extends boolean = false,
  TQuery = NoQuery,
> = {
  getAll(
    params?: ListParams<TFields, TQuery>
  ): Promise<PaginatedResponse<EntityDto<TFields, TOwned>>>;
  getById(id: string): Promise<EntityDto<TFields, TOwned>>;
  create(data: InferCreateDto<TFields>): Promise<EntityDto<TFields, TOwned>>;
  /** Partial update (PATCH): only the fields sent change. */
  update(id: string, data: InferUpdateDto<TFields>): Promise<EntityDto<TFields, TOwned>>;
  delete(id: string): Promise<void>;
};

/**
 * The HTTP helpers an `extend` body reaches for on `this` — the `ApiClient` verbs, `basePath`,
 * and `baseUrl`/`tokenSource` (so a mixin like `withFiles` can build its own `FilesClient`
 * scoped to the same backend/auth).
 */
type ServiceHttpHelpers = Pick<
  ApiClient,
  'baseUrl' | 'tokenSource' | 'get' | 'post' | 'put' | 'patch' | 'httpDelete'
> & {
  readonly basePath: string;
};

/**
 * The class `extend` receives. `class extends Base { … }` gives a `new`-able subclass whose `this`
 * has the CRUD methods and the HTTP helpers (`this.get`, `this.basePath`, …) — all typed.
 */
export type ExtendableService<
  TFields extends Fields,
  TOwned extends boolean = false,
  TQuery = NoQuery,
> = new (
  baseUrl: string,
  tokenSource: AccessTokenSource
) => CrudServiceInstance<TFields, TOwned, TQuery> & ServiceHttpHelpers;

// ── defineEntity ──────────────────────────────────────────────────────────────

type EntityOptions<
  TFields extends Fields,
  TOwned extends boolean,
  TQuery extends EntityQuery<TFields>,
  TServiceCtor extends AnyConstructor,
> = {
  name: string;
  /** Prepended to generated ids; include your own separator, e.g. `'bk_'`. */
  prefix: string;
  /** HTTP base path used by the service and, unless `routePath` is set, by the server. */
  basePath?: string;
  /** Server route path, when it differs from `basePath`. */
  routePath?: string;
  /** Rows belong to the signed-in user: `access` defaults to `owner`, DTOs gain `ownerId`. */
  userScoped?: TOwned;
  /** Per-operation access to the auto-mounted routes. Default `auth` (or `owner` when scoped). */
  access?: Partial<AccessConfig>;
  /** List filters, sort and search the API accepts; also types the service's `getAll`. */
  query?: TQuery;
  indexes?: readonly EntityIndex<TFields>[];
  /**
   * Mounts a public `GET {basePath}/active` route returning records where `from <= now <= to`
   * (be-core `ModelConfig.activeRange`), even when the entity is registered as `custom`.
   */
  activeRange?: { from: keyof TFields & string; to: keyof TFields & string };
  fields: TFields;
  /**
   * Extend the generated service class with custom methods. The returned constructor's instance
   * type becomes `InstanceType<typeof entity.Service>`, alongside the inherited CRUD.
   */
  extend?: (Base: ExtendableService<TFields, TOwned, TQuery>) => TServiceCtor;
};

export type EntityResult<
  TFields extends Fields,
  TServiceCtor extends AnyConstructor = ServiceCtor<CrudServiceInstance<TFields>>,
  TOwned extends boolean = false,
  TQuery = NoQuery,
> = {
  config: ModelConfig;
  /** The field definitions, e.g. for `toStandardSchema(entity.fields, 'create')`. */
  fields: TFields;
  query: TQuery | undefined;
  Dto: DtoClass<EntityDto<TFields, TOwned>>;
  CreateDto: DtoClass<InferCreateDto<TFields>>;
  UpdateDto: DtoClass<InferUpdateDto<TFields>>;
  /** The generated service class: CRUD plus whatever `extend` added. */
  Service: TServiceCtor;
};

// `const TFields` / `const TQuery` keep literals (`required: true`, ENUM `values`, filter
// operators) without `as const` at every call site. `TServiceCtor` is inferred from `extend`'s
// return, otherwise the plain CRUD service constructor.
export function defineEntity<
  const TFields extends Fields,
  TOwned extends boolean = false,
  const TQuery extends EntityQuery<TFields> = NoQuery,
  TServiceCtor extends AnyConstructor = ServiceCtor<CrudServiceInstance<TFields, TOwned, TQuery>>,
>(
  options: EntityOptions<TFields, TOwned, TQuery, TServiceCtor>
): EntityResult<TFields, TServiceCtor, TOwned, TQuery>;

// Looser implementation signature (not part of the public API): the body builds the service
// class through `AnyConstructor`, so it needs `extend` untied from the `TServiceCtor` the public
// overload promises to callers.
export function defineEntity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: EntityOptions<Fields, boolean, EntityQuery<Fields>, any>
): EntityResult<Fields, AnyConstructor, boolean, EntityQuery<Fields>> {
  const {
    name,
    prefix,
    basePath,
    routePath,
    userScoped,
    access,
    query,
    indexes,
    activeRange,
    fields,
    extend,
  } = options;

  const servicePath = basePath ?? `/api/${name}s`;
  const serverRoutePath = routePath ?? basePath;

  const config: ModelConfig = {
    name,
    prefix,
    ...(serverRoutePath !== undefined && { routePath: serverRoutePath }),
    ...(userScoped !== undefined && { userScoped }),
    ...(access !== undefined && { access }),
    ...(query !== undefined && { query: query as QueryConfig }),
    ...(indexes !== undefined && { indexes: indexes as readonly IndexConfig[] }),
    ...(activeRange !== undefined && { activeRange }),
    fields: toFieldConfigs(fields),
  };

  const writeOnlyKeys = Object.entries(fields)
    .filter(([, field]) => field.writeOnly)
    .map(([key]) => key);

  const ServiceBase = class extends CrudServiceBase<unknown, unknown, unknown> {
    protected readonly basePath = servicePath;
  } as unknown as AnyConstructor;

  // `extend`'s `Base` is typed as `ExtendableService`; `ServiceBase` is that class at runtime but
  // typed `AnyConstructor` above, so cast at the call.
  const Service = extend
    ? (extend as (base: AnyConstructor) => AnyConstructor)(ServiceBase)
    : ServiceBase;

  return {
    config,
    fields,
    query,
    Dto: makeDtoClass(writeOnlyKeys),
    CreateDto: makeDtoClass(),
    UpdateDto: makeDtoClass(),
    Service,
  } as EntityResult<Fields, AnyConstructor, boolean, EntityQuery<Fields>>;
}
