import { Sequelize, DataTypes, ModelAttributes, ModelStatic } from 'sequelize';
import { Express } from 'express';
import { ModelConfig, FieldConfig, FieldType } from '../types/model-config';
import { CoreEntity } from '../types/core-entity';
import { createCrudRouter } from './create-crud-router';
import { generateId } from './generate-id';
import { createExtractUser } from '../auth/create-verify-token';

const fieldTypeMap: Record<FieldType, any> = {
  STRING: DataTypes.STRING,
  TEXT: DataTypes.TEXT,
  INTEGER: DataTypes.INTEGER,
  FLOAT: DataTypes.FLOAT,
  BOOLEAN: DataTypes.BOOLEAN,
  DATE: DataTypes.DATE,
  BLOB: DataTypes.BLOB,
};

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
  return async (data: any): Promise<any> => {
    for (const [field, fieldCfg] of Object.entries(config.fields)) {
      const value = data[field];
      const isEmpty = value === undefined || value === null || value === '';

      if (fieldCfg.required && isEmpty) {
        throw new Error(`${field} is required`);
      }

      if (!isEmpty) {
        if (fieldCfg.maxLength && typeof value === 'string' && value.length > fieldCfg.maxLength) {
          throw new Error(`${field} must be at most ${fieldCfg.maxLength} characters`);
        }
        if (fieldCfg.minLength && typeof value === 'string' && value.length < fieldCfg.minLength) {
          throw new Error(`${field} must be at least ${fieldCfg.minLength} characters`);
        }
        if (fieldCfg.format === 'email' && !/.+@.+\..+/.test(String(value))) {
          throw new Error(`${field} must be a valid email`);
        }
        if (fieldCfg.format === 'url') {
          try {
            new URL(String(value));
          } catch {
            throw new Error(`${field} must be a valid URL`);
          }
        }
        if (fieldCfg.min !== undefined && value < fieldCfg.min) {
          throw new Error(`${field} must be at least ${fieldCfg.min}`);
        }
        if (fieldCfg.max !== undefined && value > fieldCfg.max) {
          throw new Error(`${field} must be at most ${fieldCfg.max}`);
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
    const validate = createValidationHook(config);
    const middleware = config.userScoped && jwtSecret ? [createExtractUser(jwtSecret)] : [];

    app.use(
      routePath,
      createCrudRouter({
        model,
        prefix: config.prefix,
        generateId,
        log: config.log ?? false,
        userScoped: config.userScoped,
        middleware,
        hooks: {
          beforeCreate: validate,
          beforeUpdate: validate,
        },
      })
    );
  }
}
