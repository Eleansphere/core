import http from 'http';
import type { AddressInfo } from 'net';
import express, { Express, RequestHandler, ErrorRequestHandler } from 'express';
import { ModelStatic, Sequelize } from 'sequelize';
import cors, { CorsOptions } from 'cors';
import bodyParser from 'body-parser';
import { createSequelize } from '../db/create-sequelize';
import { createAuthRouter, PasswordResetConfig, RegisterConfig } from '../auth/create-auth-router';
import { ProjectPlugin } from '../types/project-plugin';
import { ModelConfig } from '../types/model-config';
import {
  initModelsFromConfigs,
  mountModelRoutes,
  resolveModelAccess,
  ModelRouteOverrides,
} from '../utils/init-models-from-configs';
import { requiresRoleClaim } from '../access/access-rules';
import { defaultErrorHandler } from './error-handler';
import { EmailConfig, EmailService } from '../email/email-types';
import { createEmailService } from '../email/create-email-service';
import { StorageAdapter } from '../files/storage/storage-adapter';
import { StorageConfig, createStorageAdapter } from '../files/storage/create-storage-adapter';
import { FILE_MODEL_NAME, fileEntityConfig } from '../files/file-entity';
import { createFileServiceRouter } from '../files/create-file-service-router';

const DEFAULT_PORT = 3000;
const ROLE_CLAIM = 'role';

/**
 * What happens to the database schema on startup.
 * - `create` (default): create missing tables and indexes (Sequelize `sync()` without `alter`,
 *   so existing tables are never changed)
 * - `none`: leave the schema alone
 */
export type SyncMode = 'create' | 'none';

export interface AuthAppConfig {
  /** Name of the user model, e.g. `'user'`. */
  modelName: string;
  expiresIn?: string;
  /**
   * User columns copied into the JWT next to `id` and `email`, available as `req.user.<claim>`.
   * Role-based access policies need `'role'` here.
   */
  tokenClaims?: string[];
  passwordReset?: PasswordResetConfig;
  register?: RegisterConfig;
  changePassword?: boolean;
}

export interface AppConfig {
  databaseUrl: string;
  schema?: string;
  /** Whether to connect to the database over SSL. Defaults to true; set false for local dev databases without SSL. */
  dbSsl?: boolean;
  jwtSecret: string;
  port?: number;
  modelConfigs?: ModelConfig[];
  /** Server-side customisation of auto-mounted model routes, keyed by model name. */
  routes?: Record<string, ModelRouteOverrides>;
  syncMode?: SyncMode;
  plugins?: ProjectPlugin[];
  cors?: CorsOptions;
  /** Global middleware registered before all routes (including auto-generated ones) */
  middleware?: RequestHandler[];
  email?: EmailConfig;
  /**
   * Detached file service. When set, be-core registers a `File` model and mounts the file
   * service router (default `/api/files`) backed by an S3-compatible bucket. The storage
   * adapter is passed to plugin `registerRoutes` as its 5th argument.
   */
  storage?: StorageConfig;
  auth?: AuthAppConfig;
  /** Override the default error handler. Must be an Express 4-arg error middleware. */
  errorHandler?: ErrorRequestHandler;
}

/** Everything `createCore` builds. Nothing listens until `listen()` is called. */
export interface CoreInstance {
  app: Express;
  sequelize: Sequelize;
  models: Record<string, ModelStatic<any>>;
  emailService?: EmailService;
  storage?: StorageAdapter;
  /** Starts the HTTP server; resolves once it accepts connections. Default port: `config.port`. */
  listen(port?: number): Promise<http.Server>;
  /** Stops the HTTP server (when listening) and closes the database connection. */
  close(): Promise<void>;
}

// A role-based policy with no `role` claim in the token would reject every request with 403 —
// fail at startup instead of shipping an unreachable route.
function assertRoleClaimAvailable(config: AppConfig): void {
  if ((config.auth?.tokenClaims ?? []).includes(ROLE_CLAIM)) return;
  const modelsNeedingRole = (config.modelConfigs ?? [])
    .filter((model) => !model.skipAutoRoutes)
    .filter((model) => {
      const { read, write } = resolveModelAccess(model);
      return requiresRoleClaim(read) || requiresRoleClaim(write);
    })
    .map((model) => model.name);
  if (modelsNeedingRole.length > 0) {
    throw new Error(
      `Models [${modelsNeedingRole.join(', ')}] use a role-based access policy, but ` +
        `auth.tokenClaims does not include '${ROLE_CLAIM}'.`
    );
  }
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function buildCore(config: AppConfig): CoreInstance {
  assertRoleClaimAvailable(config);

  const sequelize = createSequelize({
    databaseUrl: config.databaseUrl,
    schema: config.schema,
    ssl: config.dbSsl,
  });

  const emailService: EmailService | undefined = config.email
    ? createEmailService(config.email)
    : undefined;

  const storageAdapter: StorageAdapter | undefined = config.storage
    ? createStorageAdapter(config.storage)
    : undefined;

  // 1. Init models from configs (generic). The file service adds its own `File` model.
  const modelConfigs = [
    ...(config.modelConfigs ?? []),
    ...(config.storage ? [fileEntityConfig] : []),
  ];
  const configModels = modelConfigs.length ? initModelsFromConfigs(modelConfigs, sequelize) : {};

  // 2. Register models from plugins (custom)
  for (const plugin of config.plugins ?? []) {
    plugin.registerModels?.(sequelize);
  }

  // All models are now registered in sequelize.models
  const allModels: Record<string, ModelStatic<any>> = { ...configModels, ...sequelize.models };

  const app = express();

  app.use(cors(config.cors));
  app.use(express.json());
  app.use(bodyParser.json());

  // 3. Register global middleware before routes
  for (const mw of config.middleware ?? []) {
    app.use(mw);
  }

  // 4. Mount auto-generated CRUD routes from modelConfigs
  if (config.modelConfigs) {
    mountModelRoutes(config.modelConfigs, configModels, app, {
      jwtSecret: config.jwtSecret,
      routes: config.routes,
    });
  }

  // 4.5 Mount the detached file service
  if (config.storage && storageAdapter) {
    app.use(
      config.storage.routePath ?? '/api/files',
      createFileServiceRouter(configModels[FILE_MODEL_NAME], storageAdapter, {
        writeMiddleware: config.storage.writeMiddleware,
        preferRedirect: config.storage.preferRedirect,
        maxFileSize: config.storage.maxFileSize,
      })
    );
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
      tokenClaims: config.auth.tokenClaims,
      emailService,
      passwordReset: config.auth.passwordReset,
      register: config.auth.register,
      changePassword: config.auth.changePassword,
    });
    app.use('/api/auth', authRouter);
  }

  app.get('/', (_req, res) => res.send('Backend is running!'));

  // 6. Register custom routes from plugins
  for (const plugin of config.plugins ?? []) {
    plugin.registerRoutes(app, sequelize, allModels, emailService, storageAdapter);
  }

  // 7. Register error handler last — catches errors from all routes and plugins
  app.use(config.errorHandler ?? defaultErrorHandler);

  let server: http.Server | undefined;

  return {
    app,
    sequelize,
    models: allModels,
    emailService,
    storage: storageAdapter,
    listen: (port = config.port ?? DEFAULT_PORT) =>
      new Promise((resolve, reject) => {
        const startingServer = app.listen(port, () => {
          server = startingServer;
          resolve(startingServer);
        });
        startingServer.once('error', reject);
      }),
    close: async () => {
      if (server) await closeServer(server);
      await sequelize.close();
    },
  };
}

async function syncSchema(core: CoreInstance, syncMode: SyncMode = 'create'): Promise<void> {
  if (syncMode === 'create') await core.sequelize.sync();
}

/**
 * Builds models, routes and services and brings the database schema up to date, without
 * listening. Use it for a server (`await core.listen()`), for scripts and scheduled jobs that need
 * the models but no HTTP, and in tests (`supertest(core.app)`).
 */
export async function createCore(config: AppConfig): Promise<CoreInstance> {
  const core = buildCore(config);
  await syncSchema(core, config.syncMode);
  return core;
}

/**
 * Builds the app, syncs the schema and starts listening; returns the Express app right away.
 * Startup failures are only logged — prefer `createCore` + `listen()` to await them.
 */
export function createApp(config: AppConfig): Express {
  const core = buildCore(config);
  syncSchema(core, config.syncMode)
    .then(() => core.listen())
    .then((server) => {
      const { port } = server.address() as AddressInfo;
      console.log(`Server running on port ${port}`);
    })
    .catch((err: Error) => console.error('[be-core] Failed to start:', err));
  return core.app;
}
