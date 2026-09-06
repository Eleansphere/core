# @eleansphere/entity-core

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
