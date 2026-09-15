# @eleansphere/entity-core

## 4.0.0-next.0

### Major Changes

- a5cd5aa: Token renewal, file slots and the auth v3 client.

  **New**

  - `AuthSession` (with `createWebSessionStorage` / `createMemorySessionStorage`): pass it to `createServiceContainer` instead of a token function. A request answered with 401 is retried once after a refresh shared by every request failing at the same time; tokens renewed by another tab are reused instead of refreshed again. `onSessionExpired` fires when the refresh token is rejected.
  - `AuthService`: `register`, `updateMe`, `deleteMe`, `changePassword`, `refresh`, `logout`. `LoginResponse` carries `refreshToken` and `user`.
  - `withFiles(Base, refType, roles)` adds `files(role)` with `list` / `upload` / `remove`; `withImages` is now built on it.
  - `references` on field definitions.
  - `ApiClient.httpDelete(path, body?)`; empty (`204`) responses resolve to `undefined`.

  **Breaking**

  - `tokenProvider` is now `tokenSource` (a token function or an `AuthSession`) on `HttpTransport` / `ApiClient` and in `extend` bodies (`this.tokenSource`).
  - `AuthService` generics are `<TUser, TRegister, TProfile>`, and `me()` returns the full user.
  - `withImages` no longer exposes a `files` getter returning a `FilesClient` (`files(role)` is the slot API). `FilesListParams.ownerId` is gone. `FileUploadFields.file` accepts any `Blob`.

- 6fd3e96: Built on `@eleansphere/schema` instead of be-core, with typed list queries and form schemas.

  **New**

  - No dependency on `@eleansphere/be-core` any more, so a frontend no longer installs Express, Sequelize and the AWS SDK. Ships ESM and CJS.
  - `defineEntity` infers literals without `as const` (`const` type parameters). `ENUM` fields need `values` and become union types. It passes `access`, `query` and `indexes` through to the model config, with column names checked against the fields. `basePath` now also sets the server `routePath`. The result exposes `fields` and `query`.
  - `readOnly` fields: in the read DTO, never in create/update DTOs.
  - `getAll({ filter, sort, q, page, limit })` is typed from the entity's `query` config (declared filters and operators, ENUM values, sortable columns) and serialized to be-core's query syntax (`toListQueryParams`).
  - `toStandardSchema(fields, 'create' | 'patch', { formatMessage, refine })`: a Standard Schema for form libraries (e.g. Nuxt UI `UForm`) running the same `validateFields` as the server. Issues keep `code` and `params` for translation.
  - `ApiClient.patch`; `ApiError.issues` and `ApiError.detail`; `LoginResponse.id`.

  **Breaking**

  - `update()` sends `PATCH` (be-core 3 serves it; be-core 2 does not).
  - DTO types: optional columns are `T | null` (what the API returns) instead of `T | undefined`; `id`, `createdAt`, `updatedAt` are always present; `userScoped` entities include `ownerId`. Create DTOs make only required-without-default fields mandatory.
  - `getAll` takes `{ filter, sort, q, page, limit }`; flat extra keys are no longer sent. Services needing other parameters override `getAll` and call `this.get` (as Klotilda's `productEntity` already does).
  - `activeRange.from` / `to` must name fields of the entity.
  - `FieldType` and the rest of the vocabulary come from `@eleansphere/schema` (still re-exported).

### Patch Changes

- Updated dependencies [6fd3e96]
- Updated dependencies [a5cd5aa]
  - @eleansphere/schema@1.0.0-next.0

## 3.0.0

### Major Changes

- 499592d: Split the client HTTP layer by concern instead of one growing `ApiClient`:

  - **`ApiError`** (new) — thrown for any non-2xx response instead of a bare `Error`. Carries `status`
    and the parsed `body`, plus `isAuthError`/`isNotFound` getters, so callers can branch on real
    state instead of matching on `err.message` strings.
  - **`HttpTransport`** (new) — the actual fetch/auth-header/error-handling plumbing. `ApiClient` and
    `FilesClient` both extend it; nothing else needs to.
  - **`ApiClient`** — now just `get`/`post`/`put`/`httpDelete`, the CRUD JSON verbs every generated
    service and `AuthService` are built on. **Removed `uploadFile` and `uploadMultipart`** — file
    upload isn't a CRUD-JSON-client concern; see `FilesClient` below. (`uploadFile` was already dead
    code, left over from the removed `AbstractFileService`; `uploadMultipart` is superseded by
    `FilesClient`.) `extend`'s `Base`/`ExtendableService` no longer exposes either on `this` —
    nothing in any consumer repo used them directly (everything went through `withImages`).
  - **`FilesClient`** (new) — client for be-core's detached file service (`/api/files`):
    `list(params)`, `upload(fields)`, `remove(fileId)`. Not part of the generated-service
    inheritance chain (files aren't a CRUD resource) — construct one with the same
    `baseUrl`/`tokenProvider` an entity service uses, or go through `withImages` for the common
    `role: 'image'` case, which now builds one internally instead of calling `this.uploadMultipart`.

  Migration: `withImages`'s own signature and behavior are unchanged. Code calling
  `this.uploadFile(...)` or `this.uploadMultipart(...)` directly from an `extend` block (nothing in
  any consumer repo does) should use `FilesClient` (or `withImages`) instead. Code catching upload
  errors by `err.message` should switch to `err instanceof ApiError` and `err.status`/`isAuthError`.

- 499592d: Removed `AbstractFileService`, and `defineEntity`'s `serviceType: 'file'` / `uploadField` options
  (the legacy BLOB-upload path, paired with be-core's now-removed `createFileRouter`). `defineEntity`
  now has a single overload instead of two. Also removed `AbstractServiceContainer` — superseded by
  `createServiceContainer` since `2.0.0`; only the now-deleted `service-core` repo still referenced
  it.

  A grep across every consumer repo found nothing left using either.

  Migration: an entity on `serviceType: 'file'` needs to move to be-core's detached file service —
  see `withImages` for the client-side convention (`listImages`/`uploadImage`/`deleteImage` against
  `/api/files`). Code on `AbstractServiceContainer` should move to `createServiceContainer`.

- 499592d: Renamed the hand-written-service base classes, dropping the `Abstract` prefix, and moved
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

### Minor Changes

- 499592d: Three additions, all passthrough to (or client-side counterparts of) new `@eleansphere/be-core`
  features — requires `@eleansphere/be-core` with the matching minor:

  - `FieldDef.hash?: 'bcrypt'` — passed through to be-core's `FieldConfig.hash`, typically paired
    with `writeOnly: true`.
  - `EntityOptions.activeRange?: { from, to }` — passed through to be-core's `ModelConfig.activeRange`.
  - `withImages(Base, refType)` — adds `listImages`/`uploadImage`/`deleteImage` to a generated
    service, the client side of be-core's detached file service convention
    (`refType`/`refId`/`role: 'image'`). Replaces hand-writing the same three methods per entity —
    `klotilda-service`'s `product`/`galleryItem` entities had verbatim-duplicate implementations.

  Migration: none required — all three are opt-in.

### Patch Changes

- 499592d: Internal cleanup, no behavior change for existing usage:

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

## 2.0.0

### Major Changes

- 37e7118: **`@eleansphere/service-core` is merged into this package.** `@eleansphere/entity-core` now also
  exports `ApiClient`, `AbstractCrudService`, `AbstractAuthService`, `AbstractFileService`,
  `AuthService`, `AbstractServiceContainer`, `PaginationParams`, `PaginatedResponse`, `FileDto`,
  `FileVisibility`, `LoginRequest`, `LoginResponse`, `AuthUser` — everything `service-core` had.
  It no longer depends on `@eleansphere/service-core`.

  Migration: repoint `@eleansphere/service-core` imports to `@eleansphere/entity-core` and drop the
  `@eleansphere/service-core` dependency. `service-core@2.0.0` is a re-export shim of this package,
  so consumers can migrate one at a time. Every current consumer already declares `service-core`
  directly, so removing it from this package's deps orphans no one.

  **`extend` is fully typed.** `extend`'s `Base` is now `ExtendableService<TFields>` — a `new`-able
  class whose `this` exposes the CRUD methods and the HTTP helpers (`this.get`, `this.post`,
  `this.basePath`, `this.uploadMultipart`, …) with real types:

  ```ts
  extend: (Base) =>
    class extends Base {
      getByBook(bookId: string) {
        return this.get<LoanDto[]>(`${this.basePath}?bookId=${bookId}`);
      }
    };
  ```

  The added methods land on `InstanceType<typeof entity.Service>` alongside the inherited CRUD, so
  `getServices().loans.getByBook(...)` **and** `.getAll(...)` are both typed. The old
  `class extends (Base as any)` / `(this as any)` style still compiles — dropping the casts is an
  opt-in per entity file. `ApiClient`'s HTTP methods and `baseUrl` are now `public` (the generated
  service's _public_ type still surfaces only CRUD; this only makes them reachable inside an
  `extend` subclass body).

  Other:

  - `AbstractUserScopedCrudService` is now a `@deprecated` alias of `AbstractCrudService` (it never
    added anything — `userScoped` is enforced server-side by be-core).
  - `@eleansphere/be-core` bumped to `^1.12.0`.
  - Build target `es2020`, `lib` includes `DOM` (for `ApiClient`'s `fetch` / `FormData` / `File`).

## 1.3.0

### Minor Changes

- 33ead1e: `defineEntity`'s `.Service` is now typed instead of `any` — for normal (non-`extend`, non-`file`)
  entities.

  - `InstanceType<typeof entity.Service>` and `new entity.Service(url, tokenProvider)` resolve to the
    CRUD surface (`getAll` → `Promise<PaginatedResponse<InferDto>>`, `getById`, `create`, `update`,
    `delete`), so typos and wrong argument shapes are caught. `createServiceContainer` picks these up
    automatically — `services.books.getAll()` is precise.
  - Entities that use `extend` keep `.Service` as `any` (the `class extends (Base as any)` body
    erases the type). The `extend` return is inferred, so added methods are visible, but the base is
    still `any`. Dropping `(Base as any)` to get full precision is a follow-up.
  - `serviceType: 'file'` entities keep `.Service` as `any` (legacy blob-upload path).
  - `defineEntity` gained a `serviceType: 'file'` overload and a second (defaulted, inferred)
    `TServiceCtor` type parameter. `EntityResult` gained a matching optional second parameter.
  - **Instantiate `extend`/`file` entity services via `createServiceContainer`, not
    `new entity.Service(...)` directly** — the erased constructor signature makes the direct call
    fail to type-check.
  - New type exports: `EntityResult`, `CrudServiceInstance`.

  Verified against `@kniho-hlod/kniho-hlod-service` + its backend and frontend (all three build
  unchanged).

## 1.2.0

### Minor Changes

- a2ae422: Add two wiring helpers so "which entities exist" lives in one registry instead of being spelled
  out repeatedly.

  **`createServiceContainer(registry, baseUrl, tokenProvider)`** — instantiates every service with
  the same args and returns a typed object, replacing hand-written `AbstractServiceContainer`
  subclasses (kniho-hlod's `KnihoHlodServices`, klotilda-frontend's inline `ServiceContainer`):

  ```ts
  export const services = createServiceContainer(
    { auth: AuthService, books: bookEntity, loans: loanEntity },
    import.meta.env.VITE_BACKEND_URL,
    () => localStorage.getItem('token')
  );
  services.books.getAll();
  ```

  Registry values are a service class or an entity object from `defineEntity` (its `.Service` is
  used). A directly-passed service class gets a precise instance type; entity `.Service` is still
  typed `any` (unchanged) until that is tightened separately.

  **`toModelConfigs(entities, { custom })`** — builds the `modelConfigs` array for be-core's
  `createApp` from a set of entity objects, marking `custom` names as `skipAutoRoutes`:

  ```ts
  createApp({ modelConfigs: toModelConfigs(allEntities, { custom: ['Product', 'Order'] }) });
  ```

  New exports: `createServiceContainer`, `toModelConfigs`, and types `ServiceRegistry`,
  `ServiceContainer`, `ToModelConfigsOptions`.

## 1.1.0

### Minor Changes

- b1dd370: `defineEntity` field definitions are now fully type-checked against be-core's field vocabulary.

  `FieldDef` is built on be-core's own `FieldType` and `FieldValidation` instead of redeclaring a
  partial copy behind a `[key: string]: unknown` index signature. Concretely:

  - `unique`, `minLength`, `maxLength`, `min`, `max`, `format` are type-checked — a typo in a
    validation key, or a wrong-typed value (e.g. `format: 'e-mail'`), is now a compile error instead
    of being silently ignored.
  - `@eleansphere/be-core` moved from `devDependencies` to `dependencies`. It is a type-only import
    (`import type`), so bundlers don't pull it in and it dedupes with the backend's own be-core, but
    it now resolves for every consumer of entity-core's types — including frontends.
  - `FieldType` is re-exported, so entity definitions can reference the union directly.
  - A compile-time guard in `entity-factory.ts` fails the build if be-core's `FieldType` ever gains a
    member that entity-core's internal `FieldTypeMap` doesn't cover.

  No runtime behavior change. Existing entity definitions compile unchanged unless they contained a
  mistyped validation option that was previously being dropped.
