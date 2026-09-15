---
'@eleansphere/be-core': major
---

Declarative access, list queries, partial updates and `createCore`.

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
