import { Sequelize, ModelStatic } from 'sequelize';
import { Express } from 'express';
import { EmailService } from '../email/email-types';
import { StorageAdapter } from '../files/storage/storage-adapter';

export interface ProjectPlugin {
  registerModels?: (sequelize: Sequelize) => void;
  registerRoutes: (
    app: Express,
    sequelize: Sequelize,
    models: Record<string, ModelStatic<any>>,
    emailService?: EmailService,
    /** Present when `AppConfig.storage` is configured — the shared blob storage adapter. */
    storage?: StorageAdapter
  ) => void;
}
