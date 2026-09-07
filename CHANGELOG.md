# @eleansphere/entity-core

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
    }
  ```
  
  The added methods land on `InstanceType<typeof entity.Service>` alongside the inherited CRUD, so
  `getServices().loans.getByBook(...)` **and** `.getAll(...)` are both typed. The old
  `class extends (Base as any)` / `(this as any)` style still compiles — dropping the casts is an
  opt-in per entity file. `ApiClient`'s HTTP methods and `baseUrl` are now `public` (the generated
  service's *public* type still surfaces only CRUD; this only makes them reachable inside an
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
    () => localStorage.getItem('token'),
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
