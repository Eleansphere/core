import type { ExtendableService } from '../entity-factory';
import type { Fields } from '../entity-types';
import type { FileDto } from '../files/file-dto';
import { withFiles } from './files.service';

const IMAGE_ROLE = 'image';

/**
 * Adds `listImages` / `uploadImage` / `deleteImage` — the `role: 'image'` shorthand over
 * {@link withFiles}, for entities with an ordered set of images (product photos, gallery items):
 *
 * ```ts
 * extend: (Base) => class extends withImages(Base, 'Product') {
 *   // entity-specific overrides/additions go here
 * },
 * ```
 */
export function withImages<TFields extends Fields, TOwned extends boolean, TQuery>(
  Base: ExtendableService<TFields, TOwned, TQuery>,
  refType: string
) {
  return class extends withFiles(Base, refType, [IMAGE_ROLE]) {
    /** Image files for `refId`, ordered by `sortOrder` (as attached by `attachFiles` server-side). */
    listImages(refId: string): Promise<FileDto[]> {
      return this.files(IMAGE_ROLE).list(refId);
    }

    /** Uploads one image for `refId`. `sortOrder` controls its position among that ref's images. */
    uploadImage(refId: string, file: Blob, sortOrder?: number): Promise<FileDto> {
      return this.files(IMAGE_ROLE).upload(refId, file, { sortOrder });
    }

    deleteImage(fileId: string): Promise<void> {
      return this.files(IMAGE_ROLE).remove(fileId);
    }
  };
}
