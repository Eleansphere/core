import { Model, ModelStatic } from 'sequelize';
import { Request, RequestHandler } from 'express';

// `data` is `Record<string, unknown>`, not `T` (the Sequelize entity) — it's the raw request body
// shape, arbitrary keys, before Sequelize ever sees it.
type CrudHooks = {
  beforeCreate?: (data: Record<string, unknown>, req: Request) => Promise<Record<string, unknown>>;
  beforeUpdate?: (data: Record<string, unknown>, req: Request) => Promise<Record<string, unknown>>;
};

export type CrudRouterOptions<T extends Model> = {
  model: ModelStatic<T>;
  prefix?: string;
  generateId?: (prefix: string) => string;
  log?: boolean;
  hooks?: CrudHooks;
  middleware?: RequestHandler[];
  userScoped?: boolean;
  /**
   * Field names to bcrypt-hash on create/update, applied after `hooks.beforeCreate`/
   * `beforeUpdate` (so a custom hook still sees the plaintext value, e.g. for a minLength check)
   * and before the record is saved. A value already looking like a bcrypt hash is left alone.
   */
  hashFields?: string[];
  /**
   * Auth middleware applied only to POST/PUT/DELETE — GET (list + by id) stays public. Runs
   * before `middleware`. Omit (the default) to leave all five routes under `middleware`, as
   * before — this is purely additive.
   */
  protect?: RequestHandler[];
  /** Extra `where` filter for GET (list), merged with the userScoped ownerId filter, if any. */
  buildWhere?: (req: Request) => Record<string, unknown>;
  /** Sort order for GET (list), Sequelize's `order` shape. Default: unordered (DB/insertion order). */
  order?: [string, 'ASC' | 'DESC'][];
  /**
   * Transforms fetched row(s) before the response is sent — e.g. attach related records
   * (`attachFiles`). Runs for GET all, GET by id (wrapped/unwrapped internally), CREATE and
   * UPDATE, so a client always sees the same enriched shape.
   */
  enrich?: (rows: T[]) => Promise<Record<string, unknown>[]>;
  /** Runs before the record is destroyed — e.g. clean up related files. */
  beforeDelete?: (entity: T, req: Request) => Promise<void>;
};
