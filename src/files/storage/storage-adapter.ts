import { Readable } from 'stream';

export type FileVisibility = 'public' | 'private';

export interface StoragePutOptions {
  contentType: string;
  /** Byte length of the body, when known. Required by some backends for stream bodies. */
  contentLength?: number;
  visibility?: FileVisibility;
}

export interface StorageByteRange {
  /** First byte offset, inclusive. */
  start: number;
  /** Last byte offset, inclusive. */
  end: number;
}

/**
 * Backend-agnostic blob storage. The `File` metadata row lives in Postgres; the bytes live
 * wherever an adapter puts them (Cloudflare R2 / any S3-compatible bucket via {@link S3StorageAdapter}).
 */
export interface StorageAdapter {
  /** Store `body` at `key`, overwriting any existing object. */
  put(key: string, body: Buffer | Readable, options: StoragePutOptions): Promise<void>;
  /** Open a readable stream for `key`, optionally for a single byte range. Rejects if absent. */
  getStream(key: string, range?: StorageByteRange): Promise<Readable>;
  /** Remove the object at `key`. Resolves even if it was already absent. */
  delete(key: string): Promise<void>;
  /** Permanent public URL for `key`, or `undefined` when no public base URL is configured. */
  getPublicUrl(key: string): string | undefined;
  /** Time-limited signed URL for `key` (default TTL 3600s). */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
