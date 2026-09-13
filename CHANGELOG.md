# @eleansphere/be-core

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
