# @eleansphere/be-core

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
