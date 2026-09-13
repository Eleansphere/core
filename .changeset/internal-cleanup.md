---
"@eleansphere/entity-core": patch
---

Internal cleanup, no behavior change for existing usage:

- Added ESLint + Prettier (matching the project's other repos — this package had neither before).
- Reorganized `src/` into domain folders, matching `be-core`'s existing layout — `http/`
  (`api-client.ts`, `api-error.ts`, `http-transport.ts`), `files/` (`file-dto.ts`,
  `files-client.ts`), `wiring/` (`model-configs.ts`, `service-container.ts`), instead of a flat
  `src/` with a few subfolders. Purely internal — `main`/`types` still point at `dist/index.js`/
  `dist/index.d.ts`, nothing imports these files by path.
- Dropped a stray `T` prefix from a couple of internal (unexported) generic type parameter names
  where it was safe — `ServiceCtor<TInstance>` → `ServiceCtor<Instance>`. Left the rest (`TFields`,
  `TServiceCtor`) alone: they're constrained against, or would collide with, real types of the
  unprefixed name declared in the same file (`Fields`, `ServiceCtor` itself) — dropping `T` there
  would self-shadow. Same reasoning applies to `AuthService`'s own `TMe`/`TLoginResponse`.

See also the `http-layer-restructure` and `rename-abstract-services` changesets for the actual
API-level HTTP layer split and naming changes this release.
