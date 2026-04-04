import { Router, Request, Response } from 'express';
import { Model } from 'sequelize';
import { GenericCrudOptions } from '../types/crud-router-types';

export function createCrudRouter<T extends Model>(options: GenericCrudOptions<T>): Router {
  const { model, prefix, generateId, log, hooks, middleware = [], userScoped = false } = options;
  const router = Router();

  function logAction(action: string, payload?: unknown) {
    if (!log) return;
    console.log(`[${model.name}] ${action}`, payload ?? '');
  }

  // CREATE
  router.post('/', ...middleware, async (req: Request, res: Response) => {
    try {
      let data = { ...req.body };
      if (generateId && prefix) {
        data.id = generateId(prefix);
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
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // READ all (with optional server-side pagination via ?page=1&limit=20)
  router.get('/', ...middleware, async (req: Request, res: Response) => {
    try {
      logAction('READ all request');
      const where = userScoped ? { ownerId: (req as any).user?.id } : undefined;
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
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // READ by ID
  router.get('/:id', ...middleware, async (req: Request, res: Response) => {
    try {
      logAction('READ by ID request', req.params.id);
      const entity = await model.findByPk(req.params.id);
      if (!entity) {
        logAction('READ by ID not found', req.params.id);
        return res.status(404).json({ message: 'Not found' });
      }
      res.json(entity);
    } catch (err) {
      logAction('READ by ID error', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // UPDATE
  router.put('/:id', ...middleware, async (req: Request, res: Response) => {
    try {
      logAction('UPDATE request', { id: req.params.id, body: req.body });
      const entity = await model.findByPk(req.params.id);
      if (!entity) {
        logAction('UPDATE not found', req.params.id);
        return res.status(404).json({ message: 'Not found' });
      }
      let data = { ...req.body };

      if (hooks?.beforeUpdate) {
        data = await hooks.beforeUpdate(data, req);
      }
      await entity.update(data);
      res.json(entity);
      logAction('UPDATE success', entity.toJSON());
    } catch (err) {
      logAction('UPDATE error', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE
  router.delete('/:id', ...middleware, async (req: Request, res: Response) => {
    try {
      logAction('DELETE request', req.params.id);
      const entity = await model.findByPk(req.params.id);
      if (!entity) {
        logAction('DELETE not found', req.params.id);
        return res.status(404).json({ message: 'Not found' });
      }
      await entity.destroy();
      res.status(204).send();
      logAction('DELETE success', req.params.id);
    } catch (err) {
      logAction('DELETE error', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
