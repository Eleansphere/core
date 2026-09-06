---
"@eleansphere/entity-core": minor
---

`defineEntity`'s `.Service` is now typed instead of `any` — for normal (non-`extend`, non-`file`)
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
