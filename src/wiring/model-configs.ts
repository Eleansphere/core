import type { ModelConfig } from '@eleansphere/be-core';

/** Anything with a be-core `ModelConfig` — an entity object from `defineEntity`, or a bare config. */
type EntityLike = { config: ModelConfig };

export interface ToModelConfigsOptions {
  /**
   * Entity names (`ModelConfig.name`) to register with `skipAutoRoutes: true` — the Sequelize
   * model is still initialized and available in plugins, but its CRUD routes are not auto-mounted
   * because a plugin serves that path instead.
   */
  custom?: string[];
}

/**
 * Builds the `modelConfigs` array for be-core's `createApp` from a set of entity objects, so
 * "which entities exist" lives in one place (an entity registry) instead of being spelled out
 * twice — once in the import list, once in an inline array.
 *
 * ```ts
 * import { allEntities } from '@my-project/service';
 *
 * createApp({
 *   modelConfigs: toModelConfigs(allEntities, { custom: ['Product', 'Order'] }),
 *   // ...
 * });
 * ```
 *
 * Accepts a record (`{ product: productEntity, order: orderEntity }`) or an array.
 */
export function toModelConfigs(
  entities: Record<string, EntityLike> | EntityLike[],
  options: ToModelConfigsOptions = {}
): ModelConfig[] {
  const custom = new Set(options.custom ?? []);
  const list = Array.isArray(entities) ? entities : Object.values(entities);
  return list.map((entity) =>
    custom.has(entity.config.name)
      ? { ...entity.config, skipAutoRoutes: true }
      : { ...entity.config }
  );
}
