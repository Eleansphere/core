// Sequelize re-exports (so projects don't need sequelize as a direct dependency)
export { DataTypes, Sequelize } from 'sequelize';

// App
export { createApp } from './app/create-app';
export type { AppConfig } from './app/create-app';
export { defaultErrorHandler, HttpError } from './app/error-handler';

// Database
export { createSequelize } from './db/create-sequelize';
export type { DbConfig } from './db/create-sequelize';

// Types
export { CoreEntity } from './types/core-entity';
export type { GenericCrudOptions } from './types/crud-router-types';
export type { ProjectPlugin } from './types/plugin-types';
export type { ModelConfig, FieldConfig, FieldType, FieldValidation } from './types/model-config';

// Utils
export { createCrudRouter } from './utils/create-crud-router';
export { generateId } from './utils/generate-id';
export { initModelsFromConfigs, mountModelRoutes } from './utils/init-models-from-configs';

// Auth
export { createAuthRouter } from './auth/create-auth-router';
export type { AuthConfig } from './auth/create-auth-router';
export { createVerifyToken, createExtractUser } from './auth/create-verify-token';

// Files — legacy BLOB-in-DB router
export { createFileRouter } from './files/create-file-router';
export type { FileFieldConfig } from './files/create-file-router';

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
