import { Model, ModelStatic } from 'sequelize';
import { Request, RequestHandler } from 'express';
import type { FieldConfig, QueryConfig } from '@eleansphere/schema';
import type { AccessRules } from '../access/access-rules';

// `data` is `Record<string, unknown>`, not `T` (the Sequelize entity) — it's the raw request body
// shape, arbitrary keys, before Sequelize ever sees it.
export type CrudHook = (
  data: Record<string, unknown>,
  req: Request
) => Promise<Record<string, unknown>>;

export type CrudHooks = {
  beforeCreate?: CrudHook;
  /** Receives only the fields the client sent: updates are partial (PATCH semantics). */
  beforeUpdate?: CrudHook;
};

export type CrudRouterOptions<T extends Model> = {
  model: ModelStatic<T>;
  prefix?: string;
  generateId?: (prefix: string) => string;
  log?: boolean;
  hooks?: CrudHooks;
  middleware?: RequestHandler[];
  /** Shorthand for `access: { read: 'owner', write: 'owner' }`. Ignored when `access` is set. */
  userScoped?: boolean;
  /**
   * Field names to bcrypt-hash on create/update, applied after `hooks.beforeCreate`/
   * `beforeUpdate` (so a custom hook still sees the plaintext value, e.g. for a minLength check)
   * and before the record is saved. A value already looking like a bcrypt hash is left alone.
   */
  hashFields?: string[];
  /**
   * Auth middleware applied only to POST/PUT/PATCH/DELETE — GET (list + by id) stays public. Runs
   * before `middleware`. Omit (the default) to leave every route under `middleware` alone.
   */
  protect?: RequestHandler[];
  /** Extra `where` filter for GET (list), ANDed with the access scope and query filters. */
  buildWhere?: (req: Request) => Record<string, unknown>;
  /**
   * Sort order for GET (list) without a `query` config, Sequelize's `order` shape. With `query`,
   * ordering comes from `?sort` / `query.defaultSort` instead.
   */
  order?: [string, 'ASC' | 'DESC'][];
  /**
   * Transforms fetched row(s) before the response is sent — e.g. attach related records
   * (`attachFiles`). Runs for GET all, GET by id (wrapped/unwrapped internally), CREATE and
   * UPDATE, so a client always sees the same enriched shape.
   */
  enrich?: (rows: T[]) => Promise<Record<string, unknown>[]>;
  /** Runs before the record is destroyed — e.g. clean up related files. */
  beforeDelete?: (entity: T, req: Request) => Promise<void>;
  /**
   * Access rules per operation. Without them (and without `userScoped`) the router is open and
   * only `protect`/`middleware` guard it — the behaviour from before `access` existed.
   */
  access?: AccessRules;
  /**
   * Resolves `req.user` before the access rules run, typically `createOptionalUser(jwtSecret)` so
   * `public` operations work without a token and the rest see who is calling.
   */
  authenticate?: RequestHandler;
  /**
   * Declares the list query parameters `GET /` accepts (filters, sort, search, pages). With it
   * every list response is paginated: `{ data, total, page, limit }`.
   */
  query?: QueryConfig;
  /** The model's field configs; `query` uses them to type-check filter values. */
  fields?: Record<string, FieldConfig>;
  /**
   * Body keys a client may never set, on top of `id`, `createdAt`, `updatedAt` (always stripped)
   * and `ownerId` under an owner policy. Typically the model's `readOnly` fields.
   */
  readOnlyFields?: readonly string[];
};
