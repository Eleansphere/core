import type { AccessConfig, AccessPolicy, ModelConfig } from '@eleansphere/schema';

/** Applies to every operation a model's config leaves out, unless the model is `userScoped`. */
export const DEFAULT_ACCESS_POLICY: AccessPolicy = 'auth';

/** A model's access policies with defaults filled in: `owner` when `userScoped`, else `auth`. */
export function resolveModelAccess(config: ModelConfig): AccessConfig {
  const fallback: AccessPolicy = config.userScoped ? 'owner' : DEFAULT_ACCESS_POLICY;
  return {
    read: config.access?.read ?? fallback,
    write: config.access?.write ?? fallback,
  };
}

/** Rows of an owner-scoped model belong to a user: it gets an indexed `ownerId` column. */
export function isOwnerScoped(config: ModelConfig): boolean {
  const { read, write } = resolveModelAccess(config);
  return read === 'owner' || write === 'owner';
}
