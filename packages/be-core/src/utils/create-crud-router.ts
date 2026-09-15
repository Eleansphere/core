import { Router, Request, Response, NextFunction } from 'express';
import { Model, WhereOptions } from 'sequelize';
import { CrudRouterOptions } from '../types/crud-router';
import { HttpError } from '../app/error-handler';
import { hashPassword, looksHashed } from './hash-password';

// `userScoped` models are expected to have this column (be-core's own convention, not a Sequelize
// one — `T extends Model` doesn't statically know about it).
type OwnedEntity = { ownerId?: string };

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
  } = options;
  const router = Router();

  // Wraps a single entity through `enrich` (which works on arrays, for the batch-loading list
  // case) and unwraps the one result back out, so GET-by-id / CREATE / UPDATE can share it.
  async function enrichOne(entity: T): Promise<Record<string, unknown>> {
    if (!enrich) return entity as unknown as Record<string, unknown>;
    const [dto] = await enrich([entity]);
    return dto;
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

  // The authenticated user's id, for userScoped models. `middleware` already rejects requests
  // without a valid token when userScoped, so a missing id here is a misconfiguration, not an
  // anonymous caller — surface it as 401 rather than silently querying with `ownerId: undefined`.
  function requireOwnerId(req: Request): string {
    const id = req.user?.id;
    if (!id) throw new HttpError(401, 'Authentication required');
    return id;
  }

  // Loads a record by id and, for userScoped models, verifies the caller owns it. "Not yours" is
  // reported as 404, not 403 — a userScoped collection must not leak which ids exist.
  async function findOwnedOrThrow(req: Request, id: string): Promise<T> {
    const entity = await model.findByPk(id);
    if (!entity) throw new HttpError(404, `${model.name} not found`);
    if (userScoped && (entity as unknown as OwnedEntity).ownerId !== requireOwnerId(req)) {
      throw new HttpError(404, `${model.name} not found`);
    }
    return entity;
  }

  // CREATE
  router.post(
    '/',
    ...protect,
    ...middleware,
    handle('CREATE', async (req, res) => {
      let data = { ...req.body };
      if (generateId && prefix) {
        data.id = generateId(prefix);
      }

      // Ownership comes from the token, never the request body. Set before the hook so field
      // validation sees it and a client-supplied `ownerId` can't win.
      if (userScoped) {
        data.ownerId = requireOwnerId(req);
      }

      if (hooks?.beforeCreate) {
        data = await hooks.beforeCreate(data, req);
      }
      if (hashFields.length) {
        data = await applyHashFields(data, hashFields);
      }
      logAction('CREATE request', data);

      const entity = await model.create(data);
      res.status(201).json(await enrichOne(entity));

      logAction('CREATE success', entity.toJSON());
    })
  );

  // READ all (with optional server-side pagination via ?page=1&limit=20)
  router.get(
    '/',
    ...middleware,
    handle('READ all', async (req, res) => {
      logAction('READ all request');
      // `WhereOptions` (no attribute type arg): `model` is the generic `Model`, so Sequelize
      // can't check `ownerId`/`buildWhere`'s keys against real column names here.
      const where: WhereOptions = {
        ...buildWhere?.(req),
        ...(userScoped && { ownerId: requireOwnerId(req) }),
      };
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      if (page !== undefined && limit !== undefined) {
        const offset = (page - 1) * limit;
        const { count, rows } = await model.findAndCountAll({ where, limit, offset, order });
        res
          .status(200)
          .json({ data: enrich ? await enrich(rows) : rows, total: count, page, limit });
      } else {
        const rows = await model.findAll({ where, order });
        res.status(200).json({ data: enrich ? await enrich(rows) : rows, total: rows.length });
      }
    })
  );

  // READ by ID
  router.get(
    '/:id',
    ...middleware,
    handle('READ by ID', async (req, res) => {
      logAction('READ by ID request', req.params.id);
      const entity = await findOwnedOrThrow(req, req.params.id);
      res.json(await enrichOne(entity));
    })
  );

  // UPDATE
  router.put(
    '/:id',
    ...protect,
    ...middleware,
    handle('UPDATE', async (req, res) => {
      logAction('UPDATE request', { id: req.params.id, body: req.body });
      const entity = await findOwnedOrThrow(req, req.params.id);
      let data = { ...req.body };

      // `ownerId` is assigned once, at creation. Pin it to the current owner so an update can't
      // reassign the record to another user (and so it stays present for field validation).
      if (userScoped) {
        data.ownerId = (entity as unknown as OwnedEntity).ownerId;
      }

      if (hooks?.beforeUpdate) {
        data = await hooks.beforeUpdate(data, req);
      }
      if (hashFields.length) {
        data = await applyHashFields(data, hashFields);
      }
      await entity.update(data);
      res.json(await enrichOne(entity));
      logAction('UPDATE success', entity.toJSON());
    })
  );

  // DELETE
  router.delete(
    '/:id',
    ...protect,
    ...middleware,
    handle('DELETE', async (req, res) => {
      logAction('DELETE request', req.params.id);
      const entity = await findOwnedOrThrow(req, req.params.id);
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
