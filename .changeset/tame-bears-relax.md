---
"@eleansphere/be-core": minor
---

Add `AppConfig.dbSsl` / `DbConfig.ssl` to opt out of the SSL `dialectOptions` for local dev
databases that don't use SSL (defaults to `true`, no behavior change for existing consumers).

`defaultErrorHandler` now maps `SequelizeUniqueConstraintError` (409), `SequelizeValidationError`
(400), and `SequelizeForeignKeyConstraintError` (409) to proper HTTP statuses instead of falling
through to a generic 500, and surfaces Sequelize's own validation messages instead of a generic one.
