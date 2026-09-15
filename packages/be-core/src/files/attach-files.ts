import { ModelStatic } from 'sequelize';
import { FileDto, toFileDto } from './file-entity';
import { StorageAdapter } from './storage/storage-adapter';

export interface AttachFilesOptions {
  /** Only attach files with this `role` (e.g. `'image'`). */
  role?: string;
  /** Property name to attach the file list under. Default `'files'`. */
  as?: string;
}

type WithId = { id: string; toJSON?: () => Record<string, unknown> };

/**
 * Batch-loads `File` rows for a set of parent rows and returns plain objects with the file list
 * attached — one query total, no N+1. Use in a plugin's read routes:
 *
 * ```ts
 * const products = await Product.findAll();
 * res.json({ data: await attachFiles(models.File, storage, 'Product', products, { role: 'image', as: 'images' }) });
 * ```
 */
export async function attachFiles<T extends WithId>(
  FileModel: ModelStatic<any>,
  storage: StorageAdapter,
  refType: string,
  rows: T[],
  options: AttachFilesOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const as = options.as ?? 'files';
  if (rows.length === 0) return [];

  const where: Record<string, unknown> = {
    refType,
    refId: rows.map((row) => row.id),
  };
  if (options.role) where.role = options.role;

  const files = await FileModel.findAll({
    where,
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  const filesByRefId = new Map<string, FileDto[]>();
  for (const file of files) {
    const refId = (file as unknown as { refId: string }).refId;
    const list = filesByRefId.get(refId) ?? [];
    list.push(toFileDto(file, storage));
    filesByRefId.set(refId, list);
  }

  return rows.map((row) => {
    const plain = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    return { ...plain, [as]: filesByRefId.get(row.id) ?? [] };
  });
}
