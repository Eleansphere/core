import type { Request } from 'express';
import type { FileRecord } from './file-entity';

export type FileAction = 'create' | 'read' | 'delete';

export interface FileAccessRequest {
  action: FileAction;
  req: Request;
  /** The stored file; absent for `create`. */
  file?: FileRecord;
  /** What the file is (or is about to be) attached to. */
  refType: string | null;
  refId: string | null;
  role: string | null;
}

/**
 * Decides one file operation. Denied uploads answer 401 (anonymous) or 403; denied reads and
 * deletes answer 404, so file ids don't leak. Compose with {@link defaultFileAuthorizer}, e.g. to
 * also require that the caller owns the `refId` a file is attached to.
 */
export type FileAuthorizer = (request: FileAccessRequest) => boolean | Promise<boolean>;

/**
 * Signed-in users may upload; public files are readable by anyone; private files are readable, and
 * any file deletable, only by the user who uploaded it.
 */
export const defaultFileAuthorizer: FileAuthorizer = ({ action, req, file }) => {
  const userId = req.user?.id;
  if (action === 'create') return userId !== undefined;
  if (action === 'read' && file?.visibility === 'public') return true;
  return userId !== undefined && file?.ownerId === userId;
};
