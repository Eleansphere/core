import type { ExtendableService } from '../entity-factory';
import type { Fields } from '../entity-types';
import type { FileDto, FileVisibility } from '../files/file-dto';
import { FilesClient } from '../files/files-client';

export interface FileUploadOptions {
  sortOrder?: number;
  visibility?: FileVisibility;
}

/** The files of one role attached to an entity's rows. */
export interface FileSlot {
  list(refId: string): Promise<FileDto[]>;
  upload(refId: string, file: Blob, options?: FileUploadOptions): Promise<FileDto>;
  remove(fileId: string): Promise<void>;
}

/**
 * Adds `files(role)` to a generated service: uploads, listings and deletions on be-core's file
 * service, scoped to this entity (`refType`) and one of its `roles`.
 *
 * ```ts
 * extend: (Base) => class extends withFiles(Base, 'book', ['cover']) {},
 * // …
 * await services.books.files('cover').upload(bookId, resizedImage);
 * ```
 */
export function withFiles<
  TFields extends Fields,
  TOwned extends boolean,
  TQuery,
  const Role extends string,
>(Base: ExtendableService<TFields, TOwned, TQuery>, refType: string, roles: readonly Role[]) {
  return class extends Base {
    files(role: Role): FileSlot {
      if (!roles.includes(role)) {
        throw new Error(`"${role}" is not a file role of ${refType} (${roles.join(', ')})`);
      }
      const client = new FilesClient(this.baseUrl, this.tokenSource);
      return {
        list: (refId) => client.list({ refType, refId, role }),
        upload: (refId, file, options = {}) =>
          client.upload({ file, refType, refId, role, ...options }),
        remove: (fileId) => client.remove(fileId),
      };
    }
  };
}
