import crypto from 'crypto';
import path from 'path';
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { ModelStatic } from 'sequelize';
import multer from 'multer';
import { HttpError } from '../app/error-handler';
import { generateId } from '../utils/generate-id';
import { FILE_ID_PREFIX, FileRecord, toFileDto } from './file-entity';
import { StorageAdapter } from './storage/storage-adapter';

export interface FileServiceRouterOptions {
  /** Middleware guarding `POST` and `DELETE`. `GET` stays public. */
  writeMiddleware?: RequestHandler[];
  /** 302-redirect public files to their CDN URL instead of proxying. Default `true`. */
  preferRedirect?: boolean;
  /** Max upload size in bytes. Default 25 MiB. */
  maxFileSize?: number;
}

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'misc';
}

function fileExtension(originalName: string | undefined, mimeType: string): string {
  const fromName = originalName ? path.extname(originalName).toLowerCase() : '';
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return EXTENSION_BY_MIME[mimeType] ?? '';
}

function normalizeVisibility(value: unknown): 'public' | 'private' {
  return value === 'private' ? 'private' : 'public';
}

/**
 * Router for the detached file service. Bytes go to `storage`; a `File` metadata row goes to
 * `FileModel`. Mounted at `/api/files` by `createApp` when `AppConfig.storage` is configured.
 *
 * - `POST   /`          multipart field `file` + optional body `refType`, `refId`, `role`,
 *                       `visibility`, `sortOrder` → `201 { ...FileDto }`
 * - `GET    /`          `?refType=&refId=&role=&ownerId=` → `{ data: FileDto[], total }`
 * - `GET    /:id`       redirect to CDN URL (public) or proxy-stream with range + ETag support
 * - `GET    /:id/meta`  the `FileDto` as JSON
 * - `DELETE /:id`       remove bytes + row
 */
export function createFileServiceRouter(
  FileModel: ModelStatic<any>,
  storage: StorageAdapter,
  options: FileServiceRouterOptions = {}
): Router {
  const {
    writeMiddleware = [],
    preferRedirect = true,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
  } = options;
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileSize } });

  router.post(
    '/',
    ...writeMiddleware,
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return next(new HttpError(400, 'No file uploaded (expected multipart field "file")'));
        }

        const body = req.body as Record<string, string | undefined>;
        const id = generateId(FILE_ID_PREFIX);
        const visibility = normalizeVisibility(body.visibility);
        const prefix = body.refType ? sanitizeSegment(body.refType) : 'misc';
        const storageKey = `${prefix}/${id}${fileExtension(req.file.originalname, req.file.mimetype)}`;
        const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        await storage.put(storageKey, req.file.buffer, {
          contentType: req.file.mimetype,
          contentLength: req.file.size,
          visibility,
        });

        const record = await FileModel.create({
          id,
          storageKey,
          originalName: req.file.originalname || null,
          mimeType: req.file.mimetype,
          size: req.file.size,
          checksum,
          visibility,
          ownerId: (req as { user?: { id?: string } }).user?.id ?? null,
          refType: body.refType ?? null,
          refId: body.refId ?? null,
          role: body.role ?? null,
          sortOrder: body.sortOrder ? Number.parseInt(body.sortOrder, 10) || 0 : 0,
        });

        res.status(201).json(toFileDto(record, storage));
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const where: Record<string, unknown> = {};
      for (const key of ['refType', 'refId', 'role', 'ownerId'] as const) {
        const value = req.query[key];
        if (typeof value === 'string' && value.length > 0) where[key] = value;
      }
      const rows = await FileModel.findAll({
        where,
        order: [
          ['sortOrder', 'ASC'],
          ['createdAt', 'ASC'],
        ],
      });
      res.json({ data: rows.map((row) => toFileDto(row, storage)), total: rows.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/meta', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await FileModel.findByPk(req.params.id);
      if (!record) return next(new HttpError(404, 'File not found'));
      res.json(toFileDto(record, storage));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = (await FileModel.findByPk(req.params.id)) as (FileRecord & object) | null;
      if (!record) return next(new HttpError(404, 'File not found'));

      const publicUrl =
        record.visibility === 'public' ? storage.getPublicUrl(record.storageKey) : undefined;
      if (preferRedirect && publicUrl) {
        return res.redirect(302, publicUrl);
      }

      const etag = record.checksum ? `"${record.checksum}"` : undefined;
      if (etag && req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', record.mimeType);
      res.setHeader(
        'Cache-Control',
        record.visibility === 'public' ? PUBLIC_CACHE_CONTROL : 'private, max-age=0'
      );
      res.setHeader('Accept-Ranges', 'bytes');
      if (etag) res.setHeader('ETag', etag);
      if (record.originalName) {
        res.setHeader(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`
        );
      }

      const rangeMatch = req.headers.range ? RANGE_PATTERN.exec(req.headers.range) : null;
      if (rangeMatch) {
        const start = rangeMatch[1] ? Number.parseInt(rangeMatch[1], 10) : 0;
        const end = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : record.size - 1;
        if (start >= record.size || end >= record.size || start > end) {
          res.setHeader('Content-Range', `bytes */${record.size}`);
          return res.status(416).end();
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${record.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        const rangedStream = await storage.getStream(record.storageKey, { start, end });
        rangedStream.on('error', next);
        return rangedStream.pipe(res);
      }

      res.setHeader('Content-Length', String(record.size));
      const stream = await storage.getStream(record.storageKey);
      stream.on('error', next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  });

  router.delete(
    '/:id',
    ...writeMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const record = await FileModel.findByPk(req.params.id);
        if (!record) return next(new HttpError(404, 'File not found'));
        await storage.delete((record as unknown as FileRecord).storageKey);
        await record.destroy();
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
