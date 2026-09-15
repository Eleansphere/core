// Sequelize re-exports (so projects don't need sequelize as a direct dependency)
export { DataTypes, Sequelize } from 'sequelize';

// App
export { createApp, createCore } from './app/create-app';
export type { AppConfig, AuthAppConfig, CoreInstance, SyncMode } from './app/create-app';
export { defaultErrorHandler, HttpError, ValidationError } from './app/error-handler';

// Database
export { createSequelize } from './db/create-sequelize';
export type { DbConfig } from './db/create-sequelize';

// Field and model vocabulary (owned by @eleansphere/schema, re-exported for convenience)
export type {
  ModelConfig,
  FieldConfig,
  FieldType,
  FieldValidation,
  StringFormat,
  AccessPolicy,
  AccessConfig,
  FilterOperator,
  QueryConfig,
  IndexConfig,
} from './types/model-config';
export type { ValidationIssue, ValidationIssueCode, ValidationMode } from '@eleansphere/schema';
export { validateFields } from '@eleansphere/schema';

// Types
export { CoreEntity } from './types/core-entity';
export type { CrudRouterOptions, CrudHook, CrudHooks } from './types/crud-router';
export type { ProjectPlugin } from './types/project-plugin';
// Side-effect-only for consumers too: this is what makes `req.user` typed on their own Express
// `Request`, not just be-core's internals — see the file for why the import (not just the type)
// matters.
export type { AuthenticatedUser } from './types/express-request';
import './types/express-request';

// Access
export { evaluateAccess } from './access/access-rules';
export type {
  AccessRule,
  AccessRules,
  AccessDecider,
  AccessGrant,
  CrudOperation,
} from './access/access-rules';

// Utils
export { createCrudRouter } from './utils/create-crud-router';
export { generateId } from './utils/generate-id';
export {
  initModelsFromConfigs,
  mountModelRoutes,
  resolveModelAccess,
  DEFAULT_ACCESS_POLICY,
} from './utils/init-models-from-configs';
export type {
  ModelRouteOverrides,
  MountModelRoutesOptions,
} from './utils/init-models-from-configs';
export { parseListQuery } from './utils/list-query';
export type { ListQuery } from './utils/list-query';
export { combineWhere } from './utils/combine-where';

// Auth
export { createAuthRouter } from './auth/create-auth-router';
export type { AuthConfig, RegisterConfig, PasswordResetConfig } from './auth/create-auth-router';
export {
  createVerifyToken,
  createExtractUser,
  createOptionalUser,
  createRequireRole,
} from './auth/create-verify-token';

// Files — detached file service (bytes in S3-compatible storage, metadata in Postgres)
export { createFileServiceRouter } from './files/create-file-service-router';
export type { FileServiceRouterOptions } from './files/create-file-service-router';
export { fileEntityConfig, toFileDto, FILE_MODEL_NAME, FILE_ID_PREFIX } from './files/file-entity';
export type { FileRecord, FileDto } from './files/file-entity';
export { attachFiles } from './files/attach-files';
export type { AttachFilesOptions } from './files/attach-files';
export { createStorageAdapter } from './files/storage/create-storage-adapter';
export type { StorageConfig } from './files/storage/create-storage-adapter';
export { S3StorageAdapter } from './files/storage/s3-storage-adapter';
export type { S3StorageConfig } from './files/storage/s3-storage-adapter';
export type {
  StorageAdapter,
  StoragePutOptions,
  StorageByteRange,
  FileVisibility,
} from './files/storage/storage-adapter';

// Email
export { createEmailService } from './email/create-email-service';
export type {
  EmailConfig,
  EmailService,
  SendEmailOptions,
  EmailTemplateFunction,
} from './email/email-types';
