import { Sequelize, DataTypes, DataType, Model, ModelAttributes, ModelStatic, Op } from 'sequelize';
import { Express, Request, Response, NextFunction } from 'express';
import { ModelConfig, FieldConfig, FieldType } from '../types/model-config';
import { CoreEntity } from '../types/core-entity';
import { createCrudRouter } from './create-crud-router';
import { generateId } from './generate-id';
import { createExtractUser } from '../auth/create-verify-token';
import { HttpError } from '../app/error-handler';

const fieldTypeMap: Record<FieldType, DataType> = {
  STRING: DataTypes.STRING,
  TEXT: DataTypes.TEXT,
  INTEGER: DataTypes.INTEGER,
  FLOAT: DataTypes.FLOAT,
  BOOLEAN: DataTypes.BOOLEAN,
  DATE: DataTypes.DATE,
  BLOB: DataTypes.BLOB,
};

/** Names of the fields matching `predicate` — e.g. every field flagged `sensitive` or `hash`. */
function fieldNamesWhere(
  fields: Record<string, FieldConfig>,
  predicate: (field: FieldConfig) => boolean
): string[] {
  return Object.entries(fields)
    .filter(([, field]) => predicate(field))
    .map(([name]) => name);
}

function buildAttributes(fields: Record<string, FieldConfig>): ModelAttributes {
  const attrs: ModelAttributes = {};
  for (const [name, field] of Object.entries(fields)) {
    attrs[name] = {
      type: fieldTypeMap[field.type],
      allowNull: !field.required,
      unique: field.unique ?? false,
      defaultValue: field.default,
    };
  }
  return attrs;
}

function createValidationHook(config: ModelConfig) {
  return async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    for (const [field, fieldCfg] of Object.entries(config.fields)) {
      const value = data[field];
      const isEmpty = value === undefined || value === null || value === '';

      if (fieldCfg.required && isEmpty) {
        throw new HttpError(400, `${field} is required`);
      }

      if (!isEmpty) {
        if (fieldCfg.maxLength && typeof value === 'string' && value.length > fieldCfg.maxLength) {
          throw new HttpError(400, `${field} must be at most ${fieldCfg.maxLength} characters`);
        }
        if (fieldCfg.minLength && typeof value === 'string' && value.length < fieldCfg.minLength) {
          throw new HttpError(400, `${field} must be at least ${fieldCfg.minLength} characters`);
        }
        if (fieldCfg.format === 'email' && !/.+@.+\..+/.test(String(value))) {
          throw new HttpError(400, `${field} must be a valid email`);
        }
        if (fieldCfg.format === 'url') {
          try {
            new URL(String(value));
          } catch {
            throw new HttpError(400, `${field} must be a valid URL`);
          }
        }
        if (fieldCfg.min !== undefined && typeof value === 'number' && value < fieldCfg.min) {
          throw new HttpError(400, `${field} must be at least ${fieldCfg.min}`);
        }
        if (fieldCfg.max !== undefined && typeof value === 'number' && value > fieldCfg.max) {
          throw new HttpError(400, `${field} must be at most ${fieldCfg.max}`);
        }
      }
    }
    return data;
  };
}

export function initModelsFromConfigs(
  configs: ModelConfig[],
  sequelize: Sequelize
): Record<string, ModelStatic<any>> {
  const models: Record<string, ModelStatic<any>> = {};

  for (const config of configs) {
    class DynamicModel extends CoreEntity {}
    Object.defineProperty(DynamicModel, 'name', { value: config.name });
    DynamicModel.initModel(sequelize, buildAttributes(config.fields), { modelName: config.name });

    const sensitiveFields = fieldNamesWhere(config.fields, (field) => !!field.sensitive);

    if (sensitiveFields.length) {
      const originalToJSON = DynamicModel.prototype.toJSON;
      DynamicModel.prototype.toJSON = function (this: Model) {
        const values = originalToJSON.call(this) as Record<string, unknown>;
        for (const field of sensitiveFields) delete values[field];
        return values;
      };
    }

    models[config.name] = DynamicModel as unknown as ModelStatic<any>;
  }

  return models;
}

export function mountModelRoutes(
  configs: ModelConfig[],
  models: Record<string, ModelStatic<any>>,
  app: Express,
  jwtSecret?: string
): void {
  for (const config of configs) {
    const model = models[config.name];
    const routePath = config.routePath ?? `/api/${config.name}s`;

    // Mounted before the CRUD routes below (and regardless of `skipAutoRoutes`, which only
    // opts a model out of the *CRUD* routes) so this literal path wins over the CRUD router's
    // `/:id` once both are mounted on the same prefix.
    if (config.activeRange) {
      const { from, to } = config.activeRange;
      app.get(`${routePath}/active`, async (_req: Request, res: Response, next: NextFunction) => {
        try {
          const now = new Date();
          const records = await model.findAll({
            where: { [from]: { [Op.lte]: now }, [to]: { [Op.gte]: now } },
            order: [[from, 'ASC']],
          });
          res.json(records.map((r) => r.toJSON()));
        } catch (err) {
          next(err);
        }
      });
    }

    if (config.skipAutoRoutes) continue;

    const validate = createValidationHook(config);
    const middleware = config.userScoped && jwtSecret ? [createExtractUser(jwtSecret)] : [];
    const hashFields = fieldNamesWhere(config.fields, (field) => field.hash === 'bcrypt');

    app.use(
      routePath,
      createCrudRouter({
        model,
        prefix: config.prefix,
        generateId,
        log: config.log ?? false,
        userScoped: config.userScoped,
        middleware,
        hashFields,
        hooks: {
          beforeCreate: validate,
          beforeUpdate: validate,
        },
      })
    );
  }
}
