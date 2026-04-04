import { Model, ModelStatic } from 'sequelize';
import { RequestHandler } from 'express';

type CrudHooks<T> = {
  beforeCreate?: (data?: any, req?: any) => Promise<any>;
  beforeUpdate?: (data?: any, req?: any) => Promise<any>;
};

export type GenericCrudOptions<T extends Model> = {
  model: ModelStatic<T>;
  prefix?: string;
  generateId?: (prefix: string) => string;
  log?: boolean;
  hooks?: CrudHooks<T>;
  middleware?: RequestHandler[];
  userScoped?: boolean;
};
