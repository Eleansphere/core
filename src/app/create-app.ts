import express, { Express, RequestHandler, ErrorRequestHandler } from 'express';
import cors, { CorsOptions } from 'cors';
import bodyParser from 'body-parser';
import { createSequelize } from '../db/create-sequelize';
import { createAuthRouter, PasswordResetConfig } from '../auth/create-auth-router';
import { ProjectPlugin } from '../types/plugin-types';
import { ModelConfig } from '../types/model-config';
import { initModelsFromConfigs, mountModelRoutes } from '../utils/init-models-from-configs';
import { defaultErrorHandler } from './error-handler';
import { EmailConfig, EmailService } from '../email/email-types';
import { createEmailService } from '../email/create-email-service';

export interface AppConfig {
  databaseUrl: string;
  schema?: string;
  jwtSecret: string;
  port?: number;
  modelConfigs?: ModelConfig[];
  plugins?: ProjectPlugin[];
  cors?: CorsOptions;
  /** Global middleware registered before all routes (including auto-generated ones) */
  middleware?: RequestHandler[];
  email?: EmailConfig;
  auth?: {
    modelName: string; // name of the user model (e.g. 'user')
    expiresIn?: string;
    passwordReset?: PasswordResetConfig;
  };
  /** Override the default error handler. Must be an Express 4-arg error middleware. */
  errorHandler?: ErrorRequestHandler;
}

export function createApp(config: AppConfig): Express {
  const sequelize = createSequelize({
    databaseUrl: config.databaseUrl,
    schema: config.schema,
  });

  const emailService: EmailService | undefined = config.email
    ? createEmailService(config.email)
    : undefined;

  // 1. Init models from configs (generic)
  const configModels = config.modelConfigs
    ? initModelsFromConfigs(config.modelConfigs, sequelize)
    : {};

  // 2. Register models from plugins (custom)
  for (const plugin of config.plugins ?? []) {
    plugin.registerModels?.(sequelize);
  }

  // All models are now registered in sequelize.models
  const allModels = { ...configModels, ...sequelize.models } as Record<string, any>;

  // 3. Sync DB
  sequelize
    .sync()
    .then(() => console.log('Database synchronized'))
    .catch((err: Error) => console.error('Error synchronizing database:', err));

  const app = express();

  app.use(cors(config.cors));
  app.use(express.json());
  app.use(bodyParser.json());

  // 3.5 Register global middleware before routes
  for (const mw of config.middleware ?? []) {
    app.use(mw);
  }

  // 4. Mount auto-generated CRUD routes from modelConfigs
  if (config.modelConfigs) {
    mountModelRoutes(config.modelConfigs, configModels, app, config.jwtSecret);
  }

  // 5. Mount auth routes
  if (config.auth) {
    const userModel = sequelize.models[config.auth.modelName];
    if (!userModel) {
      throw new Error(
        `Auth model '${config.auth.modelName}' not found. Make sure it is registered via modelConfigs or a plugin.`
      );
    }
    const authRouter = createAuthRouter(userModel, {
      jwtSecret: config.jwtSecret,
      expiresIn: config.auth.expiresIn,
      emailService,
      passwordReset: config.auth.passwordReset,
    });
    app.use('/api/auth', authRouter);
  }

  app.get('/', (_req, res) => res.send('Backend is running!'));

  // 6. Register custom routes from plugins
  for (const plugin of config.plugins ?? []) {
    plugin.registerRoutes(app, sequelize, allModels, emailService);
  }

  // 7. Register error handler last — catches errors from all routes and plugins
  app.use(config.errorHandler ?? defaultErrorHandler);

  const port = config.port ?? 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));

  return app;
}
