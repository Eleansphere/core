import crypto from 'crypto';
import path from 'path';
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Model, ModelStatic, Op } from 'sequelize';
import multer from 'multer';
import { HttpError } from '../app/error-handler';
import { generateId } from '../utils/generate-id';
import { FILE_ID_PREFIX, FileRecord, toFileDto } from './file-entity';
import { StorageAdapter } from './storage/storage-adapter';
import { defaultFileAuthorizer, FileAuthorizer } from './file-access';
import { removeStoredFile } from './delete-owned-files';

export interface FileServiceRouterOptions {
  /** Extra middleware in front of `POST` and `DELETE`. */
  writeMiddleware?: RequestHandler[];
  /** Resolves `req.user` for `authorize`, typically `createOptionalUser(jwtSecret)`. */
  authenticate?: RequestHandler;
  /** Who may upload, read and delete which files. Default {@link defaultFileAuthorizer}. */
  authorize?: FileAuthorizer;
  /** Accepted upload MIME types. Default {@link DEFAULT_ALLOWED_MIME_TYPES}; `'any'` = no check. */
  allowedMimeTypes?: readonly string[] | 'any';
  /** Roles holding one file per `refType` + `refId`; a new upload replaces the previous one. */
  singleRoles?: readonly string[];
  /** 302-redirect public files to their CDN URL instead of proxying. Default `true`. */
  preferRedirect?: boolean;
  /** Max upload size in bytes. Default 25 MiB. */
  maxFileSize?: number;
}

export const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'application/pdf',
];

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;
const UPLOAD_FIELD = 'file';
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PRIVATE_CACHE_CONTROL = 'private, max-age=0';
const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;
const ATTACHMENT_KEYS = ['refType', 'refId', 'role'] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
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

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function authenticationRequired(): HttpError {
  return new HttpError(401, 'Authentication required');
}

function fileNotFound(): HttpError {
  return new HttpError(404, 'File not found');
}

/**
 * Router for the detached file service. Bytes go to `storage`; a `File` metadata row goes to
 * `FileModel`. Mounted at `/api/files` by `createCore` when `AppConfig.storage` is configured.
 *
 * - `POST   /`          multipart field `file` + optional body `refType`, `refId`, `role`,
 *                       `visibility`, `sortOrder` → `201 { ...FileDto }`
 * - `GET    /`          `?refType=&refId=&role=` → `{ data: FileDto[], total }` (readable files only)
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
    authenticate,
    authorize = defaultFileAuthorizer,
    allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES,
    singleRoles = [],
    preferRedirect = true,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
  } = options;
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileSize } });
  const resolveUser = authenticate ? [authenticate] : [];

  // Every route below is `try { <body> } catch (err) { next(err) }` — wrapping that once here
  // means each route only states what makes it different (see create-crud-router.ts's `handle`).
  function handle(
    // Return type is `unknown`, not `void` — some bodies `return res.redirect(...)` /
    // `res.pipe(...)` etc. as a terse "and stop here", which don't return `void`.
    body: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
  ): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req, res, next) => {
      try {
        await body(req, res, next);
      } catch (err) {
        next(err);
      }
    };
  }

  // With the default policy an anonymous upload is refused anyway: refuse it before multer
  // buffers the whole body in memory.
  const refuseAnonymousUpload: RequestHandler = (req, _res, next) =>
    next(options.authorize === undefined && !req.user ? authenticationRequired() : undefined);

  function canRead(req: Request, file: FileRecord): boolean | Promise<boolean> {
    return authorize({ action: 'read', req, file, ...pickAttachment(file) });
  }

  function pickAttachment(source: { refType?: unknown; refId?: unknown; role?: unknown }) {
    return {
      refType: optionalString(source.refType),
      refId: optionalString(source.refId),
      role: optionalString(source.role),
    };
  }

  async function findReadableOrThrow(req: Request, id: string): Promise<Model> {
    const record = await FileModel.findByPk(id);
    if (!record || !(await canRead(req, record.toJSON() as FileRecord))) throw fileNotFound();
    return record;
  }

  function assertAllowedMimeType(mimeType: string): void {
    if (allowedMimeTypes !== 'any' && !allowedMimeTypes.includes(mimeType)) {
      throw new HttpError(400, `File type "${mimeType}" is not allowed`);
    }
  }

  async function removeEarlierFilesOfSingleRole(created: Model): Promise<void> {
    const { id, refType, refId, role } = created.toJSON() as FileRecord;
    if (!role || !refType || !refId || !singleRoles.includes(role)) return;
    const earlier = await FileModel.findAll({
      where: { refType, refId, role, id: { [Op.ne]: id } },
    });
    await Promise.all(earlier.map((file: Model) => removeStoredFile(file, storage)));
  }

  router.post(
    '/',
    ...writeMiddleware,
    ...resolveUser,
    refuseAnonymousUpload,
    upload.single(UPLOAD_FIELD),
    handle(async (req, res) => {
      if (!req.file) {
        throw new HttpError(400, `No file uploaded (expected multipart field "${UPLOAD_FIELD}")`);
      }
      assertAllowedMimeType(req.file.mimetype);

      const body = req.body as Record<string, unknown>;
      const attachment = pickAttachment(body);
      if (!(await authorize({ action: 'create', req, ...attachment }))) {
        throw req.user
          ? new HttpError(403, 'Not allowed to upload this file')
          : authenticationRequired();
      }

      const id = generateId(FILE_ID_PREFIX);
      const visibility = normalizeVisibility(body.visibility);
      const folder = attachment.refType ? sanitizeSegment(attachment.refType) : 'misc';
      const storageKey = `${folder}/${id}${fileExtension(req.file.originalname, req.file.mimetype)}`;
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
        ownerId: req.user?.id ?? null,
        ...attachment,
        sortOrder: Number.parseInt(String(body.sortOrder ?? ''), 10) || 0,
      });
      await removeEarlierFilesOfSingleRole(record);

      res.status(201).json(toFileDto(record, storage));
    })
  );

  router.get(
    '/',
    ...resolveUser,
    handle(async (req, res) => {
      const where: Record<string, string> = {};
      for (const key of ATTACHMENT_KEYS) {
        const value = optionalString(req.query[key]);
        if (value) where[key] = value;
      }
      const rows: Model[] = await FileModel.findAll({
        where,
        order: [
          ['sortOrder', 'ASC'],
          ['createdAt', 'ASC'],
        ],
      });
      const readable: Model[] = [];
      for (const row of rows) {
        if (await canRead(req, row.toJSON() as FileRecord)) readable.push(row);
      }
      res.json({ data: readable.map((row) => toFileDto(row, storage)), total: readable.length });
    })
  );

  router.get(
    '/:id/meta',
    ...resolveUser,
    handle(async (req, res) => {
      res.json(toFileDto(await findReadableOrThrow(req, req.params.id), storage));
    })
  );

  router.get(
    '/:id',
    ...resolveUser,
    handle(async (req, res, next) => {
      const record = (await findReadableOrThrow(req, req.params.id)).toJSON() as FileRecord;

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
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Cache-Control',
        record.visibility === 'public' ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL
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
    })
  );

  router.delete(
    '/:id',
    ...writeMiddleware,
    ...resolveUser,
    handle(async (req, res) => {
      if (!req.user && options.authorize === undefined) throw authenticationRequired();
      const record = await FileModel.findByPk(req.params.id);
      const file = record?.toJSON() as FileRecord | undefined;
      const allowed =
        file !== undefined &&
        (await authorize({ action: 'delete', req, file, ...pickAttachment(file) }));
      if (!record || !allowed) throw fileNotFound();
      await removeStoredFile(record, storage);
      res.status(204).send();
    })
  );

  return router;
}
