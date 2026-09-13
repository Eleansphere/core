---
"@eleansphere/be-core": patch
---

Internal cleanup, no behavior change for existing usage:

- `createExtractUser` is now literally `createVerifyToken` (`export const createExtractUser = createVerifyToken`) instead of a byte-for-byte duplicate implementation — the README already described it as an alias.
- `createCrudRouter` and `createFileServiceRouter`'s repeated `try { ... } catch (err) { next(err) }` per route is now a shared `handle()` wrapper.
- `init-models-from-configs.ts`'s duplicated field-name filtering (`sensitiveFields`, `hashFields`) now shares one `fieldNamesWhere` helper.
- Added ESLint (matching the project's other repos) and a vitest suite covering `createAuthRouter` (login/register/change-password) and `createCrudRouter`'s `hashFields`/`protect`/`buildWhere`/`enrich`/`beforeDelete`.
- `req.user` is now a real typed property (`Express.Request` is augmented with an `AuthenticatedUser` — exported) instead of `(req as any).user` scattered across `create-verify-token.ts`/`create-crud-router.ts`/`create-auth-router.ts`. Consumers get this too: any code doing `(req as any).user` can now just use `req.user`.
- Tightened several other `any`s that had a real type available: `ModelConfig.default` (`unknown`), `CrudHooks.beforeCreate`/`beforeUpdate` (`Record<string, unknown>` in/out, not `any`), `fieldTypeMap` (Sequelize's own `DataType`), `create-sequelize.ts`'s `dialectOptions` spread, `create-app.ts`'s merged model map (`Record<string, ModelStatic<any>>`, not `Record<string, any>`). Left `ModelStatic<any>` itself alone where it appears (plugin registries, the file service) — that one's an inherent "shape unknown at compile time" boundary of the dynamic-model pattern, not laziness.
- Renamed `types/crud-router-types.ts` → `types/crud-router.ts` and `types/plugin-types.ts` → `types/project-plugin.ts` (file names only, not the exported type names — see the `rename-generic-crud-options` changeset for the one type that did rename) — the `-types` suffix was redundant inside a folder already called `types/` (and inconsistent with its siblings `model-config.ts`/`core-entity.ts`/`express-request.ts`, which never had it). Purely internal — nothing imports these files by path.
