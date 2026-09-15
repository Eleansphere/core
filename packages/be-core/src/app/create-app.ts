import http from 'http';
import type { AddressInfo } from 'net';
import express, { Express, RequestHandler, ErrorRequestHandler } from 'express';
import { ModelStatic, Sequelize } from 'sequelize';
import cors, { CorsOptions } from 'cors';
import bodyParser from 'body-parser';
import type { ModelConfig } from '@eleansphere/schema';
import { createSequelize } from '../db/create-sequelize';
import { applyReferences } from '../db/apply-references';
import { Migration, runMigrations } from '../db/run-migrations';
import { createAuthRouter, PasswordResetConfig, RegisterConfig } from '../auth/create-auth-router';
import { createOptionalUser } from '../auth/create-verify-token';
import { RateLimitConfig } from '../auth/rate-limiter';
import {
  createRefreshTokenConfig,
  createRefreshTokenStore,
  REFRESH_TOKEN_MODEL_NAME,
  RefreshTokenStore,
} from '../auth/refresh-tokens';
import { ProjectPlugin } from '../types/project-plugin';
import {
  initModelsFromConfigs,
  mountModelRoutes,
  ModelRouteOverrides,
} from '../utils/init-models-from-configs';
import { resolveModelAccess } from '../utils/model-access';
import { parseDuration } from '../utils/duration';
import { requiresRoleClaim } from '../access/access-rules';
import { defaultErrorHandler } from './error-handler';
import { EmailConfig, EmailService } from '../email/email-types';
import { createEmailService } from '../email/create-email-service';
import { StorageAdapter } from '../files/storage/storage-adapter';
import { StorageConfig, createStorageAdapter } from '../files/storage/create-storage-adapter';
import { FILE_MODEL_NAME, fileEntityConfig } from '../files/file-entity';
import { createFileServiceRouter } from '../files/create-file-service-router';
import { deleteFilesOwnedBy } from '../files/delete-owned-files';

const DEFAULT_PORT = 3000;
const ROLE_CLAIM = 'role';
const DEFAULT_REFRESH_TOKEN_LIFETIME = '60d';
const DEFAULT_FILES_ROUTE = '/api/files';
const AUTH_ROUTE = '/api/auth';

/**
 * What happens to the database schema on startup.
 * - `create` (default): create missing tables and indexes (Sequelize `sync()` without `alter`,
 *   so existing tables are never changed)
 * - `migrate`: run the pending `AppConfig.migrations`
 * - `none`: leave the schema alone
 */
export type SyncMode = 'create' | 'migrate' | 'none';

export interface AuthAppConfig {
  /** Name of the user model, e.g. `'user'`. */
  modelName: string;
  /** Access token lifetime. Default `30m`; keep it short (e.g. `15m`) with refresh tokens. */
  expiresIn?: string;
  /**
   * User columns copied into the JWT next to `id` and `email`, available as `req.user.<claim>`.
   * Role-based access policies need `'role'` here.
   */
  tokenClaims?: string[];
  /**
   * Issues a rotating refresh token with every session (`POST /api/auth/refresh`, `/logout`).
   * `expiresIn` defaults to `60d`.
   */
  refreshTokens?: { expiresIn?: string };
  passwordReset?: PasswordResetConfig;
  register?: RegisterConfig;
  changePassword?: boolean;
  /** User columns `PATCH /api/auth/me` may change, e.g. `['displayName', 'locale']`. */
  profileFields?: string[];
  /** Mounts `DELETE /api/auth/me`: deletes the account, what it owns and its uploaded files. */
  deleteAccount?: boolean;
  /** Per-client limit on credential routes. Default 20 per 15 minutes; `'off'` disables it. */
  rateLimit?: RateLimitConfig | 'off';
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
  /** Run in order by `syncMode: 'migrate'`. */
  migrations?: readonly Migration[];
  /**
   * Express `trust proxy`: set it (e.g. `1`) behind a reverse proxy such as Railway's, so
   * `req.ip` — and with it rate limiting — sees the real client.
   */
  trustProxy?: boolean | number | string;
  plugins?: ProjectPlugin[];
  cors?: CorsOptions;
  /** Global middleware registered before all routes (including auto-generated ones) */
  middleware?: RequestHandler[];
  email?: EmailConfig;
  /**
   * Detached file service. When set, be-core registers a `File` model and mounts the file
   * service router (default `/api/files`). The storage adapter is passed to plugin
   * `registerRoutes` as its 5th argument.
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
  refreshTokens?: RefreshTokenStore;
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

function assertMigrationsWillRun(config: AppConfig): void {
  if (config.migrations?.length && config.syncMode !== 'migrate') {
    throw new Error("AppConfig.migrations only run with syncMode: 'migrate'.");
  }
}

function collectModelConfigs(config: AppConfig): ModelConfig[] {
  return [
    ...(config.modelConfigs ?? []),
    ...(config.storage ? [fileEntityConfig] : []),
    ...(config.auth?.refreshTokens ? [createRefreshTokenConfig(config.auth.modelName)] : []),
  ];
}

function createRefreshTokens(
  auth: AuthAppConfig | undefined,
  models: Record<string, ModelStatic<any>>
): RefreshTokenStore | undefined {
  if (!auth?.refreshTokens) return undefined;
  const lifetime = auth.refreshTokens.expiresIn ?? DEFAULT_REFRESH_TOKEN_LIFETIME;
  return createRefreshTokenStore(models[REFRESH_TOKEN_MODEL_NAME], parseDuration(lifetime));
}

function mountFileService(
  app: Express,
  config: AppConfig,
  storageConfig: StorageConfig,
  fileModel: ModelStatic<any>,
  storage: StorageAdapter
): void {
  app.use(
    storageConfig.routePath ?? DEFAULT_FILES_ROUTE,
    createFileServiceRouter(fileModel, storage, {
      writeMiddleware: storageConfig.writeMiddleware,
      authenticate: createOptionalUser(config.jwtSecret),
      authorize: storageConfig.authorize,
      allowedMimeTypes: storageConfig.allowedMimeTypes,
      singleRoles: storageConfig.singleRoles,
      preferRedirect: storageConfig.preferRedirect,
      maxFileSize: storageConfig.maxFileSize,
    })
  );
}

function mountAuth(
  app: Express,
  config: AppConfig,
  auth: AuthAppConfig,
  models: Record<string, ModelStatic<any>>,
  services: {
    emailService?: EmailService;
    storage?: StorageAdapter;
    refreshTokens?: RefreshTokenStore;
  }
): void {
  const userModel = models[auth.modelName];
  if (!userModel) {
    throw new Error(
      `Auth model '${auth.modelName}' not found. Make sure it is registered via modelConfigs or a plugin.`
    );
  }
  const fileModel = models[FILE_MODEL_NAME];
  const { storage } = services;

  app.use(
    AUTH_ROUTE,
    createAuthRouter(userModel, {
      jwtSecret: config.jwtSecret,
      expiresIn: auth.expiresIn,
      tokenClaims: auth.tokenClaims,
      userFields: config.modelConfigs?.find((model) => model.name === auth.modelName)?.fields,
      refreshTokens: services.refreshTokens,
      emailService: services.emailService,
      passwordReset: auth.passwordReset,
      register: auth.register,
      changePassword: auth.changePassword,
      profileFields: auth.profileFields,
      deleteAccount: auth.deleteAccount,
      rateLimit: auth.rateLimit,
      beforeDeleteAccount:
        storage && fileModel
          ? async (user) => {
              await deleteFilesOwnedBy(fileModel, storage, String(user.get('id')));
            }
          : undefined,
    })
  );
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function buildCore(config: AppConfig): CoreInstance {
  assertRoleClaimAvailable(config);
  assertMigrationsWillRun(config);

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

  // 1. Models: declared ones, plus be-core's own `File` / `RefreshToken` when enabled
  const modelConfigs = collectModelConfigs(config);
  const configModels = modelConfigs.length ? initModelsFromConfigs(modelConfigs, sequelize) : {};

  // 2. Register models from plugins (custom)
  for (const plugin of config.plugins ?? []) {
    plugin.registerModels?.(sequelize);
  }

  // All models are now registered in sequelize.models
  const allModels: Record<string, ModelStatic<any>> = { ...configModels, ...sequelize.models };

  // 3. Foreign keys — needs every model registered, and must happen before sync
  applyReferences(modelConfigs, allModels, config.auth?.modelName);

  const refreshTokens = createRefreshTokens(config.auth, allModels);

  const app = express();
  if (config.trustProxy !== undefined) {
    app.set('trust proxy', config.trustProxy);
  }

  app.use(cors(config.cors));
  app.use(express.json());
  app.use(bodyParser.json());

  // 4. Register global middleware before routes
  for (const mw of config.middleware ?? []) {
    app.use(mw);
  }

  // 5. Mount auto-generated CRUD routes from modelConfigs
  if (config.modelConfigs) {
    mountModelRoutes(config.modelConfigs, allModels, app, {
      jwtSecret: config.jwtSecret,
      routes: config.routes,
    });
  }

  // 6. Mount the detached file service
  if (config.storage && storageAdapter) {
    mountFileService(app, config, config.storage, allModels[FILE_MODEL_NAME], storageAdapter);
  }

  // 7. Mount auth routes
  if (config.auth) {
    mountAuth(app, config, config.auth, allModels, {
      emailService,
      storage: storageAdapter,
      refreshTokens,
    });
  }

  app.get('/', (_req, res) => res.send('Backend is running!'));

  // 8. Register custom routes from plugins
  for (const plugin of config.plugins ?? []) {
    plugin.registerRoutes(app, sequelize, allModels, emailService, storageAdapter);
  }

  // 9. Register error handler last — catches errors from all routes and plugins
  app.use(config.errorHandler ?? defaultErrorHandler);

  let server: http.Server | undefined;

  return {
    app,
    sequelize,
    models: allModels,
    emailService,
    storage: storageAdapter,
    refreshTokens,
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

async function prepareSchema(core: CoreInstance, config: AppConfig): Promise<void> {
  const syncMode = config.syncMode ?? 'create';
  if (syncMode === 'create') await core.sequelize.sync();
  if (syncMode === 'migrate') {
    await runMigrations(core.sequelize, config.migrations ?? [], { schema: config.schema });
  }
}

/**
 * Builds models, routes and services and brings the database schema up to date, without
 * listening. Use it for a server (`await core.listen()`), for scripts and scheduled jobs that need
 * the models but no HTTP, and in tests (`supertest(core.app)`).
 */
export async function createCore(config: AppConfig): Promise<CoreInstance> {
  const core = buildCore(config);
  await prepareSchema(core, config);
  return core;
}

/**
 * Builds the app, prepares the schema and starts listening; returns the Express app right away.
 * Startup failures are only logged — prefer `createCore` + `listen()` to await them.
 */
export function createApp(config: AppConfig): Express {
  const core = buildCore(config);
  prepareSchema(core, config)
    .then(() => core.listen())
    .then((server) => {
      const { port } = server.address() as AddressInfo;
      console.log(`Server running on port ${port}`);
    })
    .catch((err: Error) => console.error('[be-core] Failed to start:', err));
  return core.app;
}
