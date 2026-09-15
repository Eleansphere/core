import {
  Sequelize,
  DataTypes,
  DataType,
  IndexesOptions,
  Model,
  ModelAttributes,
  ModelStatic,
  Op,
} from 'sequelize';
import { Express, Request, Response, NextFunction } from 'express';
import { OWNER_FIELD, validateFields } from '@eleansphere/schema';
import type {
  AccessConfig,
  AccessPolicy,
  FieldConfig,
  FieldType,
  ModelConfig,
  ValidationMode,
} from '@eleansphere/schema';
import { CoreEntity } from '../types/core-entity';
import { createCrudRouter } from './create-crud-router';
import { generateId } from './generate-id';
import { createOptionalUser } from '../auth/create-verify-token';
import { ValidationError } from '../app/error-handler';
import type { CrudHook, CrudRouterOptions } from '../types/crud-router';
import type { AccessRules } from '../access/access-rules';

const fieldTypeMap: Record<FieldType, DataType> = {
  STRING: DataTypes.STRING,
  TEXT: DataTypes.TEXT,
  INTEGER: DataTypes.INTEGER,
  FLOAT: DataTypes.FLOAT,
  BOOLEAN: DataTypes.BOOLEAN,
  DATE: DataTypes.DATE,
  DATEONLY: DataTypes.DATEONLY,
  // A plain VARCHAR validated against `values`, not a native Postgres enum (see `FieldType`).
  ENUM: DataTypes.STRING,
  BLOB: DataTypes.BLOB,
};

/** Applies to every operation a model's config leaves out, unless the model is `userScoped`. */
export const DEFAULT_ACCESS_POLICY: AccessPolicy = 'auth';

/**
 * Server-side additions to one model's auto-mounted routes (`AppConfig.routes[modelName]`). What
 * the `ModelConfig` already declares (id prefix, fields, query, read-only fields) can't be
 * overridden here. `access` rules replace the config's policy per operation (e.g. with a
 * function); `hooks` run after field validation.
 */
export type ModelRouteOverrides = Partial<
  Omit<
    CrudRouterOptions<Model>,
    | 'model'
    | 'prefix'
    | 'generateId'
    | 'fields'
    | 'query'
    | 'readOnlyFields'
    | 'userScoped'
    | 'authenticate'
    | 'hashFields'
  >
>;

export interface MountModelRoutesOptions {
  /** Needed by every access policy except `public`. */
  jwtSecret?: string;
  routes?: Record<string, ModelRouteOverrides>;
}

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

/** Names of the fields matching `predicate` — e.g. every field flagged `sensitive` or `hash`. */
function fieldNamesWhere(
  fields: Record<string, FieldConfig>,
  predicate: (field: FieldConfig) => boolean
): string[] {
  return Object.entries(fields)
    .filter(([, field]) => predicate(field))
    .map(([name]) => name);
}

function assertValidFields(config: ModelConfig): void {
  for (const [name, field] of Object.entries(config.fields)) {
    if (field.type === 'ENUM' && !field.values?.length) {
      throw new Error(`${config.name}.${name} is an ENUM field without \`values\``);
    }
  }
}

function buildAttributes(config: ModelConfig): ModelAttributes {
  const attrs: ModelAttributes = {};
  for (const [name, field] of Object.entries(config.fields)) {
    attrs[name] = {
      type: fieldTypeMap[field.type],
      allowNull: !field.required,
      unique: field.unique ?? false,
      defaultValue: field.default,
    };
  }
  if (isOwnerScoped(config) && !(OWNER_FIELD in attrs)) {
    attrs[OWNER_FIELD] = { type: DataTypes.STRING, allowNull: false };
  }
  return attrs;
}

function buildIndexes(config: ModelConfig): IndexesOptions[] {
  const declaredIndexes = (config.indexes ?? []).map((index): IndexesOptions => ({
    fields: [...index.fields],
    unique: index.unique ?? false,
    ...(index.name && { name: index.name }),
    ...(index.where && { where: index.where }),
  }));
  return isOwnerScoped(config) ? [{ fields: [OWNER_FIELD] }, ...declaredIndexes] : declaredIndexes;
}

function createValidationHook(fields: Record<string, FieldConfig>, mode: ValidationMode): CrudHook {
  return async (data) => {
    const issues = validateFields(fields, data, { mode });
    if (issues.length > 0) throw new ValidationError(issues);
    return data;
  };
}

function chainHooks(first: CrudHook, second: CrudHook | undefined): CrudHook {
  return second ? async (data, req) => second(await first(data, req), req) : first;
}

export function initModelsFromConfigs(
  configs: ModelConfig[],
  sequelize: Sequelize
): Record<string, ModelStatic<any>> {
  const models: Record<string, ModelStatic<any>> = {};

  for (const config of configs) {
    assertValidFields(config);
    class DynamicModel extends CoreEntity {}
    Object.defineProperty(DynamicModel, 'name', { value: config.name });
    DynamicModel.initModel(sequelize, buildAttributes(config), {
      modelName: config.name,
      indexes: buildIndexes(config),
    });

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

function mountActiveRangeRoute(
  app: Express,
  routePath: string,
  model: ModelStatic<any>,
  { from, to }: { from: string; to: string }
): void {
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

function buildAccessRules(config: ModelConfig, overrides: AccessRules | undefined): AccessRules {
  const declared = resolveModelAccess(config);
  return {
    read: overrides?.read ?? declared.read,
    write: overrides?.write ?? declared.write,
  };
}

function buildModelRouterOptions(
  config: ModelConfig,
  model: ModelStatic<any>,
  jwtSecret: string | undefined,
  overrides: ModelRouteOverrides
): CrudRouterOptions<any> {
  const { access: accessOverrides, hooks: hookOverrides, ...otherOverrides } = overrides;
  return {
    ...otherOverrides,
    model,
    prefix: config.prefix,
    generateId,
    log: config.log ?? false,
    authenticate: jwtSecret ? createOptionalUser(jwtSecret) : undefined,
    access: buildAccessRules(config, accessOverrides),
    fields: config.fields,
    query: config.query,
    readOnlyFields: fieldNamesWhere(config.fields, (field) => !!field.readOnly),
    hashFields: fieldNamesWhere(config.fields, (field) => field.hash === 'bcrypt'),
    hooks: {
      beforeCreate: chainHooks(
        createValidationHook(config.fields, 'create'),
        hookOverrides?.beforeCreate
      ),
      beforeUpdate: chainHooks(
        createValidationHook(config.fields, 'patch'),
        hookOverrides?.beforeUpdate
      ),
    },
  };
}

export function mountModelRoutes(
  configs: ModelConfig[],
  models: Record<string, ModelStatic<any>>,
  app: Express,
  { jwtSecret, routes = {} }: MountModelRoutesOptions = {}
): void {
  for (const config of configs) {
    const model = models[config.name];
    const routePath = config.routePath ?? `/api/${config.name}s`;

    // Mounted before the CRUD routes below (and regardless of `skipAutoRoutes`, which only
    // opts a model out of the *CRUD* routes) so this literal path wins over the CRUD router's
    // `/:id` once both are mounted on the same prefix.
    if (config.activeRange) {
      mountActiveRangeRoute(app, routePath, model, config.activeRange);
    }

    if (config.skipAutoRoutes) continue;

    app.use(
      routePath,
      createCrudRouter(buildModelRouterOptions(config, model, jwtSecret, routes[config.name] ?? {}))
    );
  }
}
