import { ModelStatic } from 'sequelize';
import { OWNER_FIELD } from '@eleansphere/schema';
import type { ModelConfig, ReferenceAction } from '@eleansphere/schema';
import { isOwnerScoped } from '../utils/model-access';

/**
 * SQL `ON DELETE` per declared action. `RESTRICT` is emitted as `NO ACTION`: Postgres then checks
 * the constraint at the end of the statement instead of immediately, so one delete that cascades
 * to both sides (deleting an account removes its books *and* the loans pointing at them) still
 * succeeds, while deleting only the referenced row is refused.
 */
const SQL_DELETE_ACTIONS: Record<ReferenceAction, string> = {
  CASCADE: 'CASCADE',
  'SET NULL': 'SET NULL',
  RESTRICT: 'NO ACTION',
};

export const DEFAULT_REFERENCE_ACTION: ReferenceAction = 'RESTRICT';

/** Association alias, e.g. `bookIdReference` — kept distinct from the column name itself. */
const REFERENCE_ALIAS_SUFFIX = 'Reference';
const OWNER_ALIAS = 'owner';

function requireModel(
  models: Record<string, ModelStatic<any>>,
  name: string,
  referencedFrom: string
): ModelStatic<any> {
  const model = models[name];
  if (!model) throw new Error(`${referencedFrom} references unknown model '${name}'`);
  return model;
}

function applyFieldReferences(config: ModelConfig, models: Record<string, ModelStatic<any>>) {
  const source = models[config.name];
  for (const [fieldName, field] of Object.entries(config.fields)) {
    if (!field.references) continue;
    const fieldPath = `${config.name}.${fieldName}`;
    const action = field.references.onDelete ?? DEFAULT_REFERENCE_ACTION;
    if (action === 'SET NULL' && field.required) {
      throw new Error(`${fieldPath} is required, so its reference can't use onDelete 'SET NULL'`);
    }
    source.belongsTo(requireModel(models, field.references.model, fieldPath), {
      as: `${fieldName}${REFERENCE_ALIAS_SUFFIX}`,
      foreignKey: { name: fieldName, allowNull: !field.required },
      onDelete: SQL_DELETE_ACTIONS[action],
      onUpdate: 'CASCADE',
      constraints: true,
    });
  }
}

/**
 * Adds a foreign key for every field declaring `references`, and — when an auth model is given —
 * `ownerId` → that model (`CASCADE`) for every owner-scoped model, so deleting an account deletes
 * what it owns. Call once every model (plugin models included) is registered, before `sync()`;
 * Sequelize then creates the tables in dependency order.
 */
export function applyReferences(
  configs: ModelConfig[],
  models: Record<string, ModelStatic<any>>,
  authModelName?: string
): void {
  const authModel = authModelName ? models[authModelName] : undefined;
  for (const config of configs) {
    applyFieldReferences(config, models);
    if (authModel && config.name !== authModelName && isOwnerScoped(config)) {
      models[config.name].belongsTo(authModel, {
        as: OWNER_ALIAS,
        foreignKey: { name: OWNER_FIELD, allowNull: false },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        constraints: true,
      });
    }
  }
}
