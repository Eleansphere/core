export type FileVisibility = 'public' | 'private';

/**
 * Client-facing shape of a file served by the be-core detached file service
 * (`GET /api/files`, `POST /api/files`). Structurally matches be-core's `FileDto`.
 */
export interface FileDto {
  id: string;
  storageKey: string;
  originalName: string | null;
  mimeType: string;
  size: number;
  checksum: string | null;
  visibility: FileVisibility;
  ownerId: string | null;
  refType: string | null;
  refId: string | null;
  role: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Absolute CDN URL for public files; otherwise the relative `/api/files/:id` path. */
  url: string;
}
