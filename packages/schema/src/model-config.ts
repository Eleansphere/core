import type { FieldConfig } from './field-config';

/**
 * Who may perform an operation on a model's auto-mounted routes.
 *
 * - `public`: anyone, signed in or not
 * - `auth`: any signed-in user
 * - `owner`: a signed-in user, limited to rows whose `ownerId` is theirs; creates are stamped
 *   with their id
 * - `admin`: shorthand for `{ roles: ['admin'] }`
 * - `{ roles }`: a signed-in user whose token `role` claim is one of `roles`
 */
export type AccessPolicy = 'public' | 'auth' | 'owner' | 'admin' | { roles: readonly string[] };

export interface AccessConfig {
  /** List and get-by-id. */
  read: AccessPolicy;
  /** Create, update and delete. */
  write: AccessPolicy;
}

/**
 * How a list query parameter may filter one field.
 *
 * - `eq`: `?field=value`
 * - `in`: `?field=a,b` (a single value works too)
 * - `range`: `?field[gte]=1&field[lte]=5`, also `gt` / `lt` and a plain `?field=value`
 * - `isNull`: `?field[isNull]=true` or `false`
 */
export type FilterOperator = 'eq' | 'in' | 'range' | 'isNull';

export const RANGE_BOUNDS = ['gte', 'lte', 'gt', 'lt'] as const;
export type RangeBound = (typeof RANGE_BOUNDS)[number];

/** Query parameters with a fixed meaning on every list route; never treated as filters. */
export const RESERVED_QUERY_PARAMS = ['page', 'limit', 'sort', 'q'] as const;

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/**
 * Declares which list query parameters a model's `GET /` accepts. Anything outside it is rejected
 * with 400, so clients can't filter or sort on columns nobody meant to expose.
 */
export interface QueryConfig {
  filter?: Record<string, FilterOperator>;
  /** Fields `?sort=` may order by. `-` prefix for descending; comma-separate several. */
  sort?: readonly string[];
  /** Order when `?sort` is absent, same syntax, e.g. `'-createdAt'`. */
  defaultSort?: string;
  /** Text fields `?q=` matches: case-insensitive substring in any of them. */
  search?: readonly string[];
  /** Page size when `?limit` is absent. Default {@link DEFAULT_PAGE_LIMIT}. */
  defaultLimit?: number;
  /** Largest `?limit` accepted. Default {@link MAX_PAGE_LIMIT}. */
  maxLimit?: number;
}

export interface IndexConfig {
  fields: readonly string[];
  unique?: boolean;
  /**
   * Makes the index partial: column → value, where `null` means `IS NULL`. E.g. a unique index on
   * `bookId` where `returnedAt` is `null` allows only one active loan per book.
   */
  where?: Record<string, string | number | boolean | null>;
  name?: string;
}

export interface ModelConfig {
  name: string;
  /** Prepended to generated ids; include your own separator, e.g. `'bk_'`. */
  prefix: string;
  fields: Record<string, FieldConfig>;
  /** Defaults to `/api/${name}s`. */
  routePath?: string;
  log?: boolean;
  /** Shorthand for `access: { read: 'owner', write: 'owner' }`. */
  userScoped?: boolean;
  /**
   * Access to the auto-mounted CRUD routes. Each operation left out defaults to `owner` when
   * `userScoped`, otherwise to `auth`, so a model is never public by accident.
   */
  access?: Partial<AccessConfig>;
  query?: QueryConfig;
  indexes?: readonly IndexConfig[];
  /** Register the model but mount no CRUD routes (a plugin serves them). */
  skipAutoRoutes?: boolean;
  /**
   * Mounts a public `GET <routePath>/active` returning rows where `from <= now <= to`, ordered by
   * `from`. Mounted even with `skipAutoRoutes`.
   */
  activeRange?: { from: string; to: string };
}
