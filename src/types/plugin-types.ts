import { Sequelize, ModelStatic } from 'sequelize';
import { Express } from 'express';
import { EmailService } from '../email/email-types';

export interface ProjectPlugin {
  registerModels?: (sequelize: Sequelize) => void;
  registerRoutes: (
    app: Express,
    sequelize: Sequelize,
    models: Record<string, ModelStatic<any>>,
    emailService?: EmailService
  ) => void;
}
