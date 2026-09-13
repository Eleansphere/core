---
"@eleansphere/be-core": minor
---

`createAuthRouter` (and `AppConfig.auth`) can now mount two more endpoints, opt-in:

- `register: { idPrefix, requiredFields?, extraFields?, defaults? }` — mounts `POST /register`
  (self-service sign-up: required-field check, duplicate-email 409, bcrypt-hashed password).
- `changePassword: true` — mounts `POST /change-password` (JWT-protected; verifies the caller's
  current password before setting a new one). Distinct from `passwordReset`, the unauthenticated
  forgot-password-by-email flow.

Migration: none required — both are omitted by default, so existing `auth` configs are unaffected.
