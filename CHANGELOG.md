# @eleansphere/be-core

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
