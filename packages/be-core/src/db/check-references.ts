import { ModelStatic } from 'sequelize';
import { OWNER_FIELD, isEmptyValue } from '@eleansphere/schema';
import type { ModelConfig, ValidationIssue } from '@eleansphere/schema';
import { ValidationError } from '../app/error-handler';
import { isOwnerScoped } from '../utils/model-access';
import type { CrudHook } from '../types/crud-router';

interface ReferenceCheck {
  fieldName: string;
  targetName: string;
  target: ModelStatic<any>;
  /** Only the caller's own rows may be referenced. */
  targetIsOwnerScoped: boolean;
}

function collectReferenceChecks(
  config: ModelConfig,
  configsByName: ReadonlyMap<string, ModelConfig>,
  models: Record<string, ModelStatic<any>>
): ReferenceCheck[] {
  return Object.entries(config.fields).flatMap(([fieldName, field]) => {
    if (!field.references) return [];
    const targetName = field.references.model;
    const targetConfig = configsByName.get(targetName);
    return [
      {
        fieldName,
        targetName,
        target: models[targetName],
        targetIsOwnerScoped: targetConfig !== undefined && isOwnerScoped(targetConfig),
      },
    ];
  });
}

/**
 * A create/update hook rejecting reference fields whose id doesn't exist — or, when the referenced
 * model is owner-scoped, belongs to someone else — with `400` and a `reference` issue per field,
 * instead of a foreign-key error or a silent link to another user's row. Checks only the fields
 * present in the data. `undefined` when the model declares no references.
 */
export function createReferenceCheckHook(
  config: ModelConfig,
  configsByName: ReadonlyMap<string, ModelConfig>,
  models: Record<string, ModelStatic<any>>
): CrudHook | undefined {
  const checks = collectReferenceChecks(config, configsByName, models);
  if (checks.length === 0) return undefined;

  return async (data, req) => {
    const issues: ValidationIssue[] = [];
    for (const check of checks) {
      const referencedId = data[check.fieldName];
      if (isEmptyValue(referencedId)) continue;
      const where = check.targetIsOwnerScoped
        ? { id: referencedId, [OWNER_FIELD]: req.user?.id ?? null }
        : { id: referencedId };
      if ((await check.target.count({ where })) === 0) {
        issues.push({
          path: check.fieldName,
          code: 'reference',
          params: { model: check.targetName },
        });
      }
    }
    if (issues.length > 0) throw new ValidationError(issues);
    return data;
  };
}
