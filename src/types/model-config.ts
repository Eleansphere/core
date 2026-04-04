export type FieldType = 'STRING' | 'TEXT' | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'DATE' | 'BLOB';

export interface FieldValidation {
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  format?: 'email' | 'url';
}

export interface FieldConfig extends FieldValidation {
  type: FieldType;
  default?: any;
}

export interface ModelConfig {
  name: string;
  prefix: string;
  fields: Record<string, FieldConfig>;
  routePath?: string; // defaults to /api/${name}s
  log?: boolean;
  userScoped?: boolean; // if true, all routes require auth and getAll filters by ownerId
  skipAutoRoutes?: boolean; // if true, model is registered but no CRUD routes are mounted (use for models with custom plugin routes)
}
