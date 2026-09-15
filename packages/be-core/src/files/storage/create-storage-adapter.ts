import { RequestHandler } from 'express';
import { StorageAdapter } from './storage-adapter';
import { S3StorageAdapter, S3StorageConfig } from './s3-storage-adapter';
import type { FileAuthorizer } from '../file-access';

interface FileServiceConfig {
  /** Extra middleware in front of `POST` and `DELETE`. Who may do what is decided by `authorize`. */
  writeMiddleware?: RequestHandler[];
  /** Who may upload, read and delete which files. Default: `defaultFileAuthorizer`. */
  authorize?: FileAuthorizer;
  /**
   * Accepted upload MIME types (as declared by the client). Default: JPEG, PNG, WebP, AVIF, GIF and
   * PDF — no SVG, which can carry scripts. `'any'` turns the check off.
   */
  allowedMimeTypes?: readonly string[] | 'any';
  /**
   * Roles holding at most one file per `refType` + `refId`, e.g. `['avatar', 'cover']`: a new
   * upload replaces (and deletes) the previous one.
   */
  singleRoles?: readonly string[];
  /** Redirect public files to their CDN URL instead of proxying the bytes. Default `true`. */
  preferRedirect?: boolean;
  /** Max upload size in bytes. Default 25 MiB. */
  maxFileSize?: number;
  /** Mount path of the file service router. Default `/api/files`. */
  routePath?: string;
}

/**
 * Where file bytes go: an S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, …), or any
 * `StorageAdapter`, e.g. `MemoryStorageAdapter` in tests.
 */
export type StorageConfig = FileServiceConfig &
  ({ s3: S3StorageConfig; adapter?: never } | { adapter: StorageAdapter; s3?: never });

export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  if (config.s3) return new S3StorageAdapter(config.s3);
  return config.adapter;
}
