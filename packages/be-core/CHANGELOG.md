# @eleansphere/be-core

## 3.0.0-next.0

### Major Changes

- 6fd3e96: Declarative access, list queries, partial updates and `createCore`.

  **New**

  - `createCore(config)` builds models, routes and services and awaits the schema sync without listening; returns `{ app, sequelize, models, emailService, storage, listen(), close() }`. Use it for servers, scripts and scheduled jobs, and tests. `createApp` now listens only after the sync finished.
  - Field types `DATEONLY` and `ENUM` (stored as VARCHAR, validated against `values`); `readOnly` fields are never accepted from a request body.
  - `ModelConfig.access: { read, write }` with `public | auth | owner | admin | { roles }`. `createCrudRouter` also accepts per-request functions (`(req) => boolean | where`), and `AppConfig.routes[modelName]` lets a server override access, hooks, `enrich`, `buildWhere` and `beforeDelete` of an auto-mounted model without `skipAutoRoutes`.
  - `ModelConfig.query` whitelists list parameters: filters (`eq`, `in`, `range`, `isNull`), `?sort=-a,b`, `?q=` search (ILIKE, wildcards escaped), `page`/`limit` with a default and a clamped maximum. Unknown parameters, unsortable columns and badly typed values are 400s.
  - `ModelConfig.indexes`, including partial indexes (`where: { returnedAt: null }`).
  - Owner-scoped models get an indexed `ownerId` column automatically; there's no need to declare it.
  - `PATCH /:id` on every CRUD router.
  - `auth.tokenClaims` copies user columns (e.g. `role`) into the JWT; login also returns `id`.
  - `createOptionalUser`, `createRequireRole`, `evaluateAccess`, `parseListQuery`, `combineWhere`, `ValidationError`.

  **Breaking**

  - Auto-mounted routes of a model without `access` (and not `userScoped`) now require a signed-in user. Before, they were open to anyone. Add `access: { read: 'public' }` (or `write`) where that was intended.
  - Validation errors are `400 { error, message, statusCode, issues: [{ path, code, params }] }` and run the shared `validateFields`: values must have the right JSON type (e.g. `"5"` is no longer an `INTEGER`), `format: 'url'` accepts only `http(s)` URLs, and the email check is stricter.
  - `PUT /:id` is now a partial update, like `PATCH`: only the fields sent are validated and changed, and `hooks.beforeUpdate` receives only those fields.
  - Request bodies are stripped of `id`, `createdAt`, `updatedAt`, `readOnly` fields and, under an owner policy, `ownerId`, on both create and update. `generateId` still sets the id.
  - Starting fails when an auto-routed model uses a role-based policy and `auth.tokenClaims` lacks `'role'`.
  - `mountModelRoutes(configs, models, app, jwtSecret)` → `mountModelRoutes(configs, models, app, { jwtSecret, routes })`.
  - `createVerifyToken` requires the `Bearer` scheme.
  - With a `query` config, list responses are always paginated (`{ data, total, page, limit }`) and ordered by `?sort` / `query.defaultSort`; the router's `order` option applies only without `query`.
  - `FieldType`, `FieldConfig`, `ModelConfig` and friends are now defined in `@eleansphere/schema` (still re-exported from be-core).

  **Migrating Klotilda (all models `custom`, routers built with `createCrudRouter`)**: routers without `access` behave as before. Clients calling `PUT` with a full body keep working. Upgrade together with entity-core 4 (its `update()` sends `PATCH`).

- a5cd5aa: Foreign keys, migrations, auth v3, email transports and a hardened file service.

  **New**

  - Fields with `references` get foreign keys (`RESTRICT` by default, emitted as `NO ACTION` so one delete cascading to both sides still works; `CASCADE`; `SET NULL`). Create and update reject ids that don't exist or belong to another user (`400`, `reference` issue). Owner-scoped models get `ownerId` → auth model `ON DELETE CASCADE`.
  - `syncMode: 'migrate'` runs `AppConfig.migrations` through umzug (`runMigrations`, `revertMigrations`); every migration receives `{ queryInterface, sequelize, schema }`.
  - Auth:
    - rotating refresh tokens with reuse detection (`auth.refreshTokens`, `POST /refresh`, `POST /logout`)
    - registration validated by the user model's fields, answered with a session
    - `GET /me` from the database, `PATCH /me` (`profileFields`), `DELETE /me` (`deleteAccount`: deletes owned rows and uploaded files)
    - single-use password reset links; a password change or reset logs every other session out
    - per-client rate limiting on credential routes (`rateLimit`, `429`); `AppConfig.trustProxy`
  - Email transports: `smtp`, `resend` (HTTP API, no SDK), `log`, or any `EmailTransport` instance (`MemoryEmailTransport` for tests). Failures surface as `EmailError`.
  - File service: an `authorize` hook (`defaultFileAuthorizer`), a MIME allowlist (`allowedMimeTypes`, no SVG by default), `singleRoles` (a new avatar or cover replaces the old one), `X-Content-Type-Options: nosniff`, and `storage.adapter` for any `StorageAdapter` (`MemoryStorageAdapter`).

  **Breaking**

  - `EmailConfig` is `{ from, transport }`; SMTP settings move to `transport: { kind: 'smtp', host, port, secure, auth }`. (Klotilda: `klotilda-api/src/plugins/orders/email.service.ts` is the only call to update.)
  - `passwordReset.template` is required, and `passwordReset` without `AppConfig.email` fails at startup instead of silently sending nothing.
  - `register` is `{ idPrefix, fields?, defaults? }`: `requiredFields` / `extraFields` are gone (required-ness comes from the user model's fields). It answers `201` with a session instead of `{ message }`.
  - `GET /api/auth/me` returns the user row from the database (404 once deleted) instead of the token's `{ id, email }`.
  - Missing credentials are `400` with `required` issues.
  - Owner-scoped models reference their owner, so rows can only be created for users that exist.
  - File service: uploads need a signed-in user by default; private files are served only to their uploader; only the uploader may delete; `GET /api/files?ownerId=` is gone; types outside the allowlist (e.g. SVG) are refused.
  - Credential routes are rate-limited by default (20 requests per 15 minutes per client); use `auth.rateLimit: 'off'` in tests.
  - `createApp` / `createCore` builds with `mountModelRoutes` receiving every registered model (plugin models included).

### Patch Changes

- Updated dependencies [6fd3e96]
- Updated dependencies [a5cd5aa]
  - @eleansphere/schema@1.0.0-next.0

## 2.0.0

### Major Changes

- 62361e9: Removed `createFileRouter` and `FileFieldConfig` — the legacy BLOB-in-database file router. Prefer
  the detached file service (`AppConfig.storage` + `createFileServiceRouter`, an S3-compatible
  bucket with only a `File` metadata row in Postgres), already used by every project on this. A grep
  across every consumer repo found no remaining `serviceType: 'file'` entity, so nothing still uses
  this path.

  Migration: a project on `createFileRouter` needs to move its BLOB column to the detached file
  service — see `@eleansphere/entity-core`'s `withImages` for the client side of that convention.

- 62361e9: Renamed `GenericCrudOptions` → `CrudRouterOptions` — the `Generic` prefix was filler (there's no
  non-generic variant to distinguish it from) and didn't match its file, `types/crud-router.ts`.

  Migration: replace `GenericCrudOptions` with `CrudRouterOptions`. A grep across every consumer repo
  found none importing this type directly (everyone just calls `createCrudRouter({...})` and lets
  inference handle it) — nothing live needs to change.

### Minor Changes

- 62361e9: `createAuthRouter` (and `AppConfig.auth`) can now mount two more endpoints, opt-in:
  - `register: { idPrefix, requiredFields?, extraFields?, defaults? }` — mounts `POST /register`
    (self-service sign-up: required-field check, duplicate-email 409, bcrypt-hashed password).
  - `changePassword: true` — mounts `POST /change-password` (JWT-protected; verifies the caller's
    current password before setting a new one). Distinct from `passwordReset`, the unauthenticated
    forgot-password-by-email flow.

  Migration: none required — both are omitted by default, so existing `auth` configs are unaffected.

- 62361e9: `createCrudRouter` (and `ModelConfig`) grow generic hooks for shapes that previously had to be
  hand-rolled per project: public-read-protected-write CRUD, row enrichment (attached files),
  custom list filters/order, and delete side effects.
  - `protect` — auth middleware applied only to `POST`/`PUT`/`DELETE`; `GET` (list + by id) stays
    public. `middleware` keeps applying to all five routes as before — this is purely additive.
  - `buildWhere(req)` — extra `where` filter for the list route, merged with the `userScoped`
    `ownerId` filter when both are present.
  - `order` — Sequelize `order` shape for the list route (e.g. `[['sortOrder', 'ASC']]`).
  - `enrich(rows)` — transforms fetched row(s) before the response is sent (e.g. `attachFiles`),
    applied consistently to list, get-by-id, create and update responses.
  - `beforeDelete(entity, req)` — runs before the record is destroyed, for cleaning up related
    data (e.g. deleting a product's image files from storage before the product row).
  - `hashFields` — field names to bcrypt-hash on create/update, skipping values that already look
    like a bcrypt hash. `ModelConfig.fields[name].hash: 'bcrypt'` drives this automatically for
    auto-mounted routes (see the `hash` field flag, also in this release).
  - `ModelConfig.activeRange: { from, to }` — mounts a public `GET {routePath}/active` route
    returning records where `from <= now <= to`, ordered by `from` ascending. Mounted even when
    `skipAutoRoutes` is set, since that flag only opts a model out of the CRUD routes.

  Migration: none required — every new option is optional and additive.

### Patch Changes

- 62361e9: Internal cleanup, no behavior change for existing usage:
  - `createExtractUser` is now literally `createVerifyToken` (`export const createExtractUser = createVerifyToken`) instead of a byte-for-byte duplicate implementation — the README already described it as an alias.
  - `createCrudRouter` and `createFileServiceRouter`'s repeated `try { ... } catch (err) { next(err) }` per route is now a shared `handle()` wrapper.
  - `init-models-from-configs.ts`'s duplicated field-name filtering (`sensitiveFields`, `hashFields`) now shares one `fieldNamesWhere` helper.
  - Added ESLint (matching the project's other repos) and a vitest suite covering `createAuthRouter` (login/register/change-password) and `createCrudRouter`'s `hashFields`/`protect`/`buildWhere`/`enrich`/`beforeDelete`.
  - `req.user` is now a real typed property (`Express.Request` is augmented with an `AuthenticatedUser` — exported) instead of `(req as any).user` scattered across `create-verify-token.ts`/`create-crud-router.ts`/`create-auth-router.ts`. Consumers get this too: any code doing `(req as any).user` can now just use `req.user`.
  - Tightened several other `any`s that had a real type available: `ModelConfig.default` (`unknown`), `CrudHooks.beforeCreate`/`beforeUpdate` (`Record<string, unknown>` in/out, not `any`), `fieldTypeMap` (Sequelize's own `DataType`), `create-sequelize.ts`'s `dialectOptions` spread, `create-app.ts`'s merged model map (`Record<string, ModelStatic<any>>`, not `Record<string, any>`). Left `ModelStatic<any>` itself alone where it appears (plugin registries, the file service) — that one's an inherent "shape unknown at compile time" boundary of the dynamic-model pattern, not laziness.
  - Renamed `types/crud-router-types.ts` → `types/crud-router.ts` and `types/plugin-types.ts` → `types/project-plugin.ts` (file names only, not the exported type names — see the `rename-generic-crud-options` changeset for the one type that did rename) — the `-types` suffix was redundant inside a folder already called `types/` (and inconsistent with its siblings `model-config.ts`/`core-entity.ts`/`express-request.ts`, which never had it). Purely internal — nothing imports these files by path.

## 1.12.0

### Minor Changes

- 4e48ca2: `userScoped` models now enforce ownership on every auto-generated route, not just `GET /`.

  Previously `userScoped: true` only filtered the list endpoint by `ownerId`. `GET /:id`, `PUT /:id`
  and `DELETE /:id` did no ownership check, and `POST /` trusted whatever `ownerId` the client sent —
  so any authenticated user could read, modify or delete another user's records by id, or create
  records owned by someone else.

  `createCrudRouter` now, when `userScoped`:
  - **`POST /`** — sets `ownerId` from the JWT before validation and hooks run; a client-supplied
    `ownerId` is overwritten.
  - **`GET /:id` / `PUT /:id` / `DELETE /:id`** — return `404` (not `403`, to avoid leaking which ids
    exist) unless the caller owns the record.
  - **`PUT /:id`** — pins `ownerId` to the current owner, so an update can't hand the record to
    another user.

  Migration: none required. Clients may stop sending `ownerId` in create/update bodies, but sending
  it still works (it's ignored). Any code that relied on cross-user access through the generic CRUD
  routes of a `userScoped` model was a bug and now returns `404`.

## 1.11.0

### Minor Changes

- 9a74324: Add a detached file service — store uploaded files in an S3-compatible bucket (Cloudflare R2, AWS
  S3, MinIO, Backblaze B2) with only a metadata row in Postgres, instead of a BLOB column on the
  business entity.

  Set `AppConfig.storage` to enable it:

  ```ts
  createApp({
    // ...
    storage: {
      s3: {
        endpoint: process.env.R2_ENDPOINT!,
        bucket: process.env.R2_BUCKET!,
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        publicBaseUrl: process.env.R2_PUBLIC_BASE_URL, // enables CDN redirect for public files
      },
      writeMiddleware: [createExtractUser(process.env.JWT_SECRET!)],
    },
  });
  ```

  be-core then registers a `File` model and mounts a router (default `/api/files`):
  - `POST /api/files` — multipart field `file` + optional `refType`, `refId`, `role`, `visibility`,
    `sortOrder`; streams bytes to the bucket, returns `{ ...FileDto }`
  - `GET /api/files/:id` — 302-redirects public files to their CDN URL, or proxy-streams with
    `ETag` / `Range` / conditional-request support
  - `GET /api/files?refType=&refId=&role=` — list files for an entity
  - `GET /api/files/:id/meta` — metadata as JSON
  - `DELETE /api/files/:id` — removes bytes + row

  New exports: `createFileServiceRouter`, `fileEntityConfig`, `attachFiles`, `toFileDto`,
  `createStorageAdapter`, `S3StorageAdapter`, and the `StorageAdapter` / `StorageConfig` /
  `S3StorageConfig` / `FileRecord` / `FileDto` types.

  `ProjectPlugin.registerRoutes` gains a 5th argument, `storage?: StorageAdapter`, passed when
  `AppConfig.storage` is configured. Backward compatible — existing plugins ignore it.

  The legacy `createFileRouter` (BLOB in DB) is unchanged and still exported.

## 1.10.0

### Minor Changes

- db730e4: Add `FieldConfig.sensitive` — marking a field `sensitive: true` now strips it from every JSON
  response (`toJSON()`) for that model, e.g. password hashes. Previously there was no way to hide
  a field from API responses at runtime.
- db730e4: Add `AppConfig.dbSsl` / `DbConfig.ssl` to opt out of the SSL `dialectOptions` for local dev
  databases that don't use SSL (defaults to `true`, no behavior change for existing consumers).

  `defaultErrorHandler` now maps `SequelizeUniqueConstraintError` (409), `SequelizeValidationError`
  (400), and `SequelizeForeignKeyConstraintError` (409) to proper HTTP statuses instead of falling
  through to a generic 500, and surfaces Sequelize's own validation messages instead of a generic one.

### Patch Changes

- 4b4a594: Update dependencies to fix npm audit findings: `bcrypt` 5→6 (drops the vulnerable
  `@mapbox/node-pre-gyp`/`tar` chain in favor of `node-gyp-build`), `sequelize` patched to
  6.37.8 (fixes vulnerable `dottie`/`validator` transitive versions). No public API change —
  be-core only uses `bcrypt.hash`/`bcrypt.compare`, stable across both majors.
