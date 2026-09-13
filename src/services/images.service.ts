import type { FileDto } from '../files/file-dto';
import type { ExtendableService, Fields } from '../entity-factory';
import { FilesClient } from '../files/files-client';

/**
 * Adds `listImages` / `uploadImage` / `deleteImage` to a generated service — the `role: 'image'`
 * convenience over `FilesClient` (be-core's detached file service:
 * `GET/POST/DELETE /api/files` with `refType`/`refId`/`role`). Wrap a `defineEntity` `extend`'s
 * `Base` with this instead of hand-writing the same three methods per entity:
 *
 * ```ts
 * extend: (Base) => class extends withImages(Base, 'Product') {
 *   // entity-specific overrides/additions go here
 * },
 * ```
 */
export function withImages<TFields extends Fields>(
  Base: ExtendableService<TFields>,
  refType: string
) {
  return class extends Base {
    // Not `private` — `withImages`'s return type is inferred for an exported function, and TS
    // requires an inferred class type used that way to have only public members.
    get files(): FilesClient {
      return new FilesClient(this.baseUrl, this.tokenProvider);
    }

    /** Image files for `refId`, ordered by `sortOrder` (as attached by `attachFiles` server-side). */
    listImages(refId: string): Promise<FileDto[]> {
      return this.files.list({ refType, refId, role: 'image' });
    }

    /** Uploads one image for `refId`. `sortOrder` controls its position among that ref's images. */
    uploadImage(refId: string, file: File, sortOrder?: number): Promise<FileDto> {
      return this.files.upload({ file, refType, refId, role: 'image', sortOrder });
    }

    deleteImage(fileId: string): Promise<void> {
      return this.files.remove(fileId);
    }
  };
}
