---
"@eleansphere/entity-core": minor
---

Add two wiring helpers so "which entities exist" lives in one registry instead of being spelled
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
