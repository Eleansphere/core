---
"@eleansphere/entity-core": major
---

Renamed the hand-written-service base classes, dropping the `Abstract` prefix, and moved
`withImages` to a file that matches the project's `*.service.ts` naming convention:

- `AbstractCrudService<TDto, TCreate, TUpdate>` → `CrudServiceBase<Dto, Create, Update>`
  (`services/abstract-crud.service.ts` → `services/crud.service.ts`)
- `AbstractAuthService<TLoginRequest, TLoginResponse, TMe>` → `AuthServiceBase<LoginRequest, LoginResponse, Me>`
  (`services/abstract-auth.service.ts` → `services/auth-base.service.ts`) — needs the `Base` suffix
  rather than a bare drop of `Abstract`, since the concrete `AuthService` already owns that name.
  `AuthService`'s own generics (`TMe`, `TLoginResponse`) are unchanged — they're constrained
  (`TLoginResponse extends LoginResponse`) against the real interfaces of the same name, so dropping
  their `T` would self-shadow.
- `services/with-images.ts` → `services/images.service.ts` (the exported `withImages` function is
  unchanged — it's a mixin, not a class, so it keeps its `with*` name).
- Removed the `@deprecated` `AbstractUserScopedCrudService` alias — its own doc comment said "kept
  for one major," and breaking changes are already going out this release.

Migration: replace `AbstractCrudService`/`AbstractAuthService`/`AbstractUserScopedCrudService` with
`CrudServiceBase`/`AuthServiceBase`/`CrudServiceBase` respectively. A grep across every consumer
repo found only the already-deleted `service-core` repo still referencing the old names — nothing
live needs to change.
