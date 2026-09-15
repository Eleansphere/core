import { Model, ModelStatic } from 'sequelize';
import { StorageAdapter } from './storage/storage-adapter';

/**
 * Deletes a file's bytes, then its row. A storage failure is logged rather than thrown, so a
 * missing object never leaves an undeletable row behind.
 */
export async function removeStoredFile(file: Model, storage: StorageAdapter): Promise<void> {
  const storageKey = String(file.get('storageKey'));
  await storage
    .delete(storageKey)
    .catch((err: unknown) => console.error(`[be-core] Could not delete "${storageKey}":`, err));
  await file.destroy();
}

/** Deletes every file a user uploaded (bytes and rows), e.g. when the account is deleted. */
export async function deleteFilesOwnedBy(
  FileModel: ModelStatic<Model>,
  storage: StorageAdapter,
  ownerId: string
): Promise<number> {
  const files = await FileModel.findAll({ where: { ownerId } });
  for (const file of files) {
    await removeStoredFile(file, storage);
  }
  return files.length;
}
