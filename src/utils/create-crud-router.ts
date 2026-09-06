import { Router, Request, Response, NextFunction } from 'express';
import { Model } from 'sequelize';
import { GenericCrudOptions } from '../types/crud-router-types';
import { HttpError } from '../app/error-handler';

export function createCrudRouter<T extends Model>(options: GenericCrudOptions<T>): Router {
  const { model, prefix, generateId, log, hooks, middleware = [], userScoped = false } = options;
  const router = Router();

  function logAction(action: string, payload?: unknown) {
    if (!log) return;
    console.log(`[${model.name}] ${action}`, payload ?? '');
  }

  // The authenticated user's id, for userScoped models. `middleware` already rejects requests
  // without a valid token when userScoped, so a missing id here is a misconfiguration, not an
  // anonymous caller — surface it as 401 rather than silently querying with `ownerId: undefined`.
  function requireOwnerId(req: Request): string {
    const id = (req as any).user?.id;
    if (!id) throw new HttpError(401, 'Authentication required');
    return id;
  }

  // Loads a record by id and, for userScoped models, verifies the caller owns it. "Not yours" is
  // reported as 404, not 403 — a userScoped collection must not leak which ids exist.
  async function findOwnedOrThrow(req: Request, id: string): Promise<T> {
    const entity = await model.findByPk(id);
    if (!entity) throw new HttpError(404, `${model.name} not found`);
    if (userScoped && (entity as any).ownerId !== requireOwnerId(req)) {
      throw new HttpError(404, `${model.name} not found`);
    }
    return entity;
  }

  // CREATE
  router.post('/', ...middleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
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
      logAction('CREATE request', data);

      const entity = await model.create(data);
      res.status(201).json(entity);

      logAction('CREATE success', entity.toJSON());
    } catch (err) {
      logAction('CREATE error', err);
      next(err);
    }
  });

  // READ all (with optional server-side pagination via ?page=1&limit=20)
  router.get('/', ...middleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      logAction('READ all request');
      // Loosely typed: `model` is the generic `Model`, so Sequelize's attribute-keyed
      // `WhereOptions` can't see `ownerId`.
      const where: any = userScoped ? { ownerId: requireOwnerId(req) } : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      if (page !== undefined && limit !== undefined) {
        const offset = (page - 1) * limit;
        const { count, rows } = await model.findAndCountAll({ where, limit, offset });
        res.status(200).json({ data: rows, total: count, page, limit });
      } else {
        const rows = await model.findAll({ where });
        res.status(200).json({ data: rows, total: rows.length });
      }
    } catch (err) {
      logAction('READ all error', err);
      next(err);
    }
  });

  // READ by ID
  router.get('/:id', ...middleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      logAction('READ by ID request', req.params.id);
      const entity = await findOwnedOrThrow(req, req.params.id);
      res.json(entity);
    } catch (err) {
      logAction('READ by ID error', err);
      next(err);
    }
  });

  // UPDATE
  router.put('/:id', ...middleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      logAction('UPDATE request', { id: req.params.id, body: req.body });
      const entity = await findOwnedOrThrow(req, req.params.id);
      let data = { ...req.body };

      // `ownerId` is assigned once, at creation. Pin it to the current owner so an update can't
      // reassign the record to another user (and so it stays present for field validation).
      if (userScoped) {
        data.ownerId = (entity as any).ownerId;
      }

      if (hooks?.beforeUpdate) {
        data = await hooks.beforeUpdate(data, req);
      }
      await entity.update(data);
      res.json(entity);
      logAction('UPDATE success', entity.toJSON());
    } catch (err) {
      logAction('UPDATE error', err);
      next(err);
    }
  });

  // DELETE
  router.delete('/:id', ...middleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      logAction('DELETE request', req.params.id);
      const entity = await findOwnedOrThrow(req, req.params.id);
      await entity.destroy();
      res.status(204).send();
      logAction('DELETE success', req.params.id);
    } catch (err) {
      logAction('DELETE error', err);
      next(err);
    }
  });

  return router;
}
