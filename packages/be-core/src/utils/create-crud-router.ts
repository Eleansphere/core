import { Router, Request, Response, NextFunction } from 'express';
import { CreationAttributes, Model, WhereOptions } from 'sequelize';
import { OWNER_FIELD, SYSTEM_FIELDS } from '@eleansphere/schema';
import type { QueryConfig } from '@eleansphere/schema';
import { CrudRouterOptions } from '../types/crud-router';
import { HttpError } from '../app/error-handler';
import { hashPassword, looksHashed } from './hash-password';
import { AccessGrant, AccessRules, CrudOperation, evaluateAccess } from '../access/access-rules';
import { combineWhere } from './combine-where';
import { parseListQuery } from './list-query';

const OWNER_ONLY_ACCESS: AccessRules = { read: 'owner', write: 'owner' };

async function applyHashFields(
  data: Record<string, unknown>,
  fields: string[]
): Promise<Record<string, unknown>> {
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && value && !looksHashed(value)) {
      data[field] = await hashPassword(value);
    }
  }
  return data;
}

function withoutKeys(data: Record<string, unknown>, keys: Iterable<string>) {
  const copy = { ...data };
  for (const key of keys) delete copy[key];
  return copy;
}

export function createCrudRouter<T extends Model>(options: CrudRouterOptions<T>): Router {
  const {
    model,
    prefix,
    generateId,
    log,
    hooks,
    middleware = [],
    userScoped = false,
    hashFields = [],
    protect = [],
    buildWhere,
    order,
    enrich,
    beforeDelete,
    access,
    authenticate,
    query,
    fields = {},
    readOnlyFields = [],
  } = options;
  const router = Router();
  const accessRules = access ?? (userScoped ? OWNER_ONLY_ACCESS : undefined);
  const resolveUser = authenticate ? [authenticate] : [];
  const clientForbiddenFields = [...SYSTEM_FIELDS, ...readOnlyFields];

  // Wraps a single entity through `enrich` (which works on arrays, for the batch-loading list
  // case) and unwraps the one result back out, so GET-by-id / CREATE / UPDATE can share it.
  async function enrichOne(entity: T): Promise<Record<string, unknown>> {
    if (!enrich) return entity as unknown as Record<string, unknown>;
    const [dto] = await enrich([entity]);
    return dto;
  }

  function toResponseRows(rows: T[]): Promise<unknown[]> | T[] {
    return enrich ? enrich(rows) : rows;
  }

  function logAction(action: string, payload?: unknown) {
    if (!log) return;
    console.log(`[${model.name}] ${action}`, payload ?? '');
  }

  // Every route below is `try { <body> } catch (err) { logAction('<LABEL> error', err); next(err) }`
  // — wrapping that once here means each route only states what makes it different.
  function handle(
    label: string,
    body: (req: Request, res: Response) => Promise<void>
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req, res, next) => {
      try {
        await body(req, res);
      } catch (err) {
        logAction(`${label} error`, err);
        next(err);
      }
    };
  }

  function grantAccess(req: Request, operation: CrudOperation): Promise<AccessGrant> {
    const rule = accessRules?.[operation];
    return rule === undefined ? Promise.resolve({}) : evaluateAccess(rule, req);
  }

  // Ids, timestamps and server-managed fields never come from a client; under an owner policy
  // neither does `ownerId` (it's stamped from the token on create and can't be reassigned).
  function readClientBody(req: Request, grant: AccessGrant): Record<string, unknown> {
    const forbidden = grant.ownerId
      ? [...clientForbiddenFields, OWNER_FIELD]
      : clientForbiddenFields;
    return withoutKeys(req.body ?? {}, forbidden);
  }

  // "Not in your scope" and "doesn't exist" are both 404, so a scoped collection doesn't leak
  // which ids exist.
  async function findInScopeOrThrow(id: string, scope: WhereOptions | undefined): Promise<T> {
    const entity = await model.findOne({ where: { ...(scope as object), id } as WhereOptions });
    if (!entity) throw new HttpError(404, `${model.name} not found`);
    return entity;
  }

  async function sendQueriedPage(
    req: Request,
    res: Response,
    scopedWhere: WhereOptions,
    queryConfig: QueryConfig
  ): Promise<void> {
    const list = parseListQuery(req.query, queryConfig, fields);
    const { count, rows } = await model.findAndCountAll({
      where: combineWhere(scopedWhere, list.where),
      order: list.order,
      limit: list.limit,
      offset: list.offset,
    });
    res.json({
      data: await toResponseRows(rows),
      total: count,
      page: list.page,
      limit: list.limit,
    });
  }

  // Without a `query` config: every row, or one page when both `?page` and `?limit` are sent.
  async function sendUnconfiguredList(
    req: Request,
    res: Response,
    scopedWhere: WhereOptions
  ): Promise<void> {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    if (page !== undefined && limit !== undefined) {
      const offset = (page - 1) * limit;
      const { count, rows } = await model.findAndCountAll({
        where: scopedWhere,
        limit,
        offset,
        order,
      });
      res.json({ data: await toResponseRows(rows), total: count, page, limit });
    } else {
      const rows = await model.findAll({ where: scopedWhere, order });
      res.json({ data: await toResponseRows(rows), total: rows.length });
    }
  }

  // CREATE
  router.post(
    '/',
    ...protect,
    ...middleware,
    ...resolveUser,
    handle('CREATE', async (req, res) => {
      const grant = await grantAccess(req, 'write');
      let data = readClientBody(req, grant);
      if (generateId && prefix) {
        data.id = generateId(prefix);
      }
      if (grant.ownerId) {
        data[OWNER_FIELD] = grant.ownerId;
      }

      if (hooks?.beforeCreate) {
        data = await hooks.beforeCreate(data, req);
      }
      if (hashFields.length) {
        data = await applyHashFields(data, hashFields);
      }
      logAction('CREATE request', data);

      const entity = await model.create(data as CreationAttributes<T>);
      res.status(201).json(await enrichOne(entity));

      logAction('CREATE success', entity.toJSON());
    })
  );

  // READ all
  router.get(
    '/',
    ...middleware,
    ...resolveUser,
    handle('READ all', async (req, res) => {
      logAction('READ all request');
      const { scope } = await grantAccess(req, 'read');
      const scopedWhere = combineWhere(scope, buildWhere?.(req) as WhereOptions | undefined);
      if (query) {
        await sendQueriedPage(req, res, scopedWhere, query);
      } else {
        await sendUnconfiguredList(req, res, scopedWhere);
      }
    })
  );

  // READ by ID
  router.get(
    '/:id',
    ...middleware,
    ...resolveUser,
    handle('READ by ID', async (req, res) => {
      logAction('READ by ID request', req.params.id);
      const { scope } = await grantAccess(req, 'read');
      const entity = await findInScopeOrThrow(req.params.id, scope);
      res.json(await enrichOne(entity));
    })
  );

  // UPDATE — PATCH and PUT share one partial-update handler: only the fields sent change, and the
  // update hook sees just those. PUT stays for existing clients.
  const updateHandler = handle('UPDATE', async (req, res) => {
    const grant = await grantAccess(req, 'write');
    const entity = await findInScopeOrThrow(req.params.id, grant.scope);
    let data = readClientBody(req, grant);

    if (hooks?.beforeUpdate) {
      data = await hooks.beforeUpdate(data, req);
    }
    if (hashFields.length) {
      data = await applyHashFields(data, hashFields);
    }
    logAction('UPDATE request', { id: req.params.id, body: data });

    await entity.update(data);
    res.json(await enrichOne(entity));
    logAction('UPDATE success', entity.toJSON());
  });
  router.patch('/:id', ...protect, ...middleware, ...resolveUser, updateHandler);
  router.put('/:id', ...protect, ...middleware, ...resolveUser, updateHandler);

  // DELETE
  router.delete(
    '/:id',
    ...protect,
    ...middleware,
    ...resolveUser,
    handle('DELETE', async (req, res) => {
      logAction('DELETE request', req.params.id);
      const { scope } = await grantAccess(req, 'write');
      const entity = await findInScopeOrThrow(req.params.id, scope);
      if (beforeDelete) {
        await beforeDelete(entity, req);
      }
      await entity.destroy();
      res.status(204).send();
      logAction('DELETE success', req.params.id);
    })
  );

  return router;
}
