import { ModelConfig } from '../types/model-config';
import { FileVisibility, StorageAdapter } from './storage/storage-adapter';

export const FILE_MODEL_NAME = 'File';
export const FILE_ID_PREFIX = 'file';

/** Shape of a persisted `File` row. */
export interface FileRecord {
  id: string;
  /** Object key inside the storage bucket, e.g. `Product/file_ab12…/photo.jpg`. */
  storageKey: string;
  originalName: string | null;
  mimeType: string;
  size: number;
  /** SHA-256 hex digest of the bytes — used as the `ETag` and for de-duplication. */
  checksum: string | null;
  visibility: FileVisibility;
  ownerId: string | null;
  /** Entity this file belongs to, e.g. `'Product'`. */
  refType: string | null;
  refId: string | null;
  /** Free-form slot label, e.g. `'image'`, `'avatar'`, `'attachment'`. */
  role: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** `FileRecord` plus the resolved URL a client should load. */
export interface FileDto extends FileRecord {
  /** Absolute CDN URL for public files; otherwise the relative `/api/files/:id` path. */
  url: string;
}

/**
 * `ModelConfig` for the be-core-managed `File` table. Registered automatically by `createApp`
 * when `AppConfig.storage` is set. `skipAutoRoutes` — the file service mounts its own router.
 */
export const fileEntityConfig: ModelConfig = {
  name: FILE_MODEL_NAME,
  prefix: FILE_ID_PREFIX,
  skipAutoRoutes: true,
  fields: {
    storageKey: { type: 'STRING', required: true },
    originalName: { type: 'STRING' },
    mimeType: { type: 'STRING', required: true },
    size: { type: 'INTEGER', required: true },
    checksum: { type: 'STRING' },
    visibility: { type: 'STRING', default: 'public' },
    ownerId: { type: 'STRING' },
    refType: { type: 'STRING' },
    refId: { type: 'STRING' },
    role: { type: 'STRING' },
    sortOrder: { type: 'INTEGER', default: 0 },
  },
  indexes: [{ fields: ['refType', 'refId', 'role'] }, { fields: ['ownerId'] }],
};

/** Serialises a `File` model instance to a {@link FileDto}, resolving its load URL. */
export function toFileDto(
  record: { toJSON: () => Record<string, unknown> },
  storage: StorageAdapter
): FileDto {
  const json = record.toJSON() as unknown as FileRecord;
  const publicUrl =
    json.visibility === 'public' ? storage.getPublicUrl(json.storageKey) : undefined;
  return { ...json, url: publicUrl ?? `/api/files/${json.id}` };
}
