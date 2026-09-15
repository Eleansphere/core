---
'@eleansphere/be-core': major
---

Foreign keys, migrations, auth v3, email transports and a hardened file service.

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
