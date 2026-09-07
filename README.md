# @eleansphere/entity-core

The client-side toolkit for [be-core](https://github.com/Eleansphere/be-core) apps.

Define an entity **once** and derive its be-core model config, its DTO classes, and its HTTP
service from that single definition — so the backend model, the DTOs, and the frontend service can
never drift apart. Plus the HTTP layer those services are built on (`ApiClient`, the abstract
service classes, `AuthService`) and the wiring helpers (`createServiceContainer`, `toModelConfigs`).

> **2.0.0** merged in `@eleansphere/service-core` — everything it exported now comes from here, and
> `extend` is fully typed. `@eleansphere/service-core@2.0.0` is a re-export shim; repoint its
> imports here and drop the extra dependency.

## Installation

```
@eleansphere:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm install @eleansphere/entity-core
```

## Usage

```typescript
import { defineEntity } from '@eleansphere/entity-core';

export const bookEntity = defineEntity({
  name: 'book',
  prefix: 'b',
  basePath: '/api/books',
  userScoped: true,
  fields: {
    title: { type: 'STRING', required: true, maxLength: 200 },
    author: { type: 'STRING', maxLength: 100 },
    isAvailable: { type: 'BOOLEAN', required: true },
    ownerId: { type: 'STRING', required: true },
  },
});
```

This gives you three things from one definition:

```typescript
bookEntity.config   // ModelConfig — pass to be-core's createApp({ modelConfigs: [...] })
bookEntity.Dto      // read DTO class — new bookEntity.Dto(data)
bookEntity.Service   // service class — register it in createServiceContainer({ books: bookEntity, ... })
```

For a plain entity, `InstanceType<typeof bookEntity.Service>` is the CRUD surface — `getAll` returns
`Promise<PaginatedResponse<InferDto<…>>>`, plus `getById` / `create` / `update` / `delete`. Entities that
use `extend`, or `serviceType: 'file'`, keep `.Service` loose (`any`) for now, and must be instantiated
through `createServiceContainer` rather than `new entity.Service(...)`.

### Options

| Option        | Type                | Description                                                          |
| ------------- | ------------------- | ---------------------------------------------------------------------- |
| `name`        | `string`             | Entity name — Sequelize model name, default route path base           |
| `prefix`      | `string`             | ID prefix (`'b'` → `'b_abc123...'`)                                   |
| `basePath`    | `string`             | Frontend HTTP base path (default `/api/{name}s`)                     |
| `routePath`   | `string`             | Override backend route path if it differs from `basePath`             |
| `userScoped`  | `boolean`            | JWT-required + `ownerId`-filtered on both backend and frontend        |
| `serviceType` | `'crud' \| 'file'`   | `'file'` generates an `AbstractFileService`-based service              |
| `uploadField` | `string`             | Field name for file uploads (`serviceType: 'file'`, default `'file'`) |
| `fields`      | `Fields`             | Field definitions — see below                                         |
| `extend`      | `(Base) => Base`     | Add custom methods to the generated service class                     |

**Field types:** `STRING`, `TEXT`, `INTEGER`, `FLOAT`, `BOOLEAN`, `DATE`, `BLOB`. `FieldDef` is built on
be-core's own `FieldType` and `FieldValidation` (be-core is a dependency of this package), so every be-core
field validation — `unique`, `minLength`, `maxLength`, `min`, `max`, `format: 'email' | 'url'` — is
**type-checked here**, not waved through an untyped index signature. A typo in a validation key, or a value of
the wrong type, is a compile error. If be-core adds a field type, a compile-time guard in `entity-factory.ts`
forces `FieldTypeMap` to be updated before the new type can be used.

### `writeOnly` — the one flag that used to be two

```typescript
password: { type: 'STRING', required: true, minLength: 6, writeOnly: true },
```

`writeOnly: true` on a field does **all** of the following, from one declaration:

1. Excluded from the read `Dto` TypeScript type
2. Deleted at runtime from any `new entity.Dto(data)` instance — even if the raw data passed in
   happens to contain it, it won't survive construction
3. Translated into be-core's `sensitive: true` on the emitted `ModelConfig`, so the field is
   stripped from the actual JSON response the backend sends

Earlier, (1) was `writeOnly` and (3) was a separate `sensitive` flag on be-core's own config — nothing connected
them, so it was possible to set one and forget the other (a `password` field would look excluded on the frontend
type while the backend was still returning the hash in every response). `writeOnly` is now the only flag you need.

Still present in `CreateDto`/`UpdateDto` — a password has to be submittable on create/update, it's just never sent
back.

### `userScoped` entities

All routes require a JWT, and be-core stamps `ownerId` from the token on create and enforces it on
`GET`/`PUT`/`DELETE /:id`. The entity must define an `ownerId` field. Purely a backend concern —
the generated client service is a plain CRUD service.

### Extending the generated service

`Base` is a real, `new`-able class; `this` has the CRUD methods and the HTTP helpers, all typed:

```typescript
export const loanEntity = defineEntity({
  name: 'loan',
  prefix: 'l',
  userScoped: true,
  fields: { /* ... */ },
  extend: (Base) =>
    class extends Base {
      getByBook(bookId: string) {
        return this.get<LoanDto[]>(`${this.basePath}?bookId=${bookId}`);
      }
    },
});
```

`loanEntity.Service`'s instance type is now `CrudServiceInstance & { getByBook(...) }`, so
`getServices().loans.getByBook(...)` **and** `.getAll()` are both typed. The older
`class extends (Base as any)` + `(this as any)` still compiles.

## Wiring helpers

Keep the entity list in one registry and derive both sides from it.

### `createServiceContainer` — frontend

```typescript
import { createServiceContainer, AuthService } from '@eleansphere/entity-core';

export const services = createServiceContainer(
  { auth: AuthService, books: bookEntity, loans: loanEntity },
  import.meta.env.VITE_BACKEND_URL,
  () => localStorage.getItem('token'),
);

services.books.getAll();
```

Each registry value is either a service class (instantiated as `new Class(baseUrl, tokenProvider)`)
or an entity object (its `.Service` is instantiated). Replaces hand-written
`AbstractServiceContainer` subclasses where every `this.x = new X(...this.args())` line was a place
to forget an entity.

### `toModelConfigs` — backend

```typescript
import { createApp } from '@eleansphere/be-core';
import { toModelConfigs } from '@eleansphere/entity-core';
import { allEntities } from '@my-project/service';

createApp({
  modelConfigs: toModelConfigs(allEntities, { custom: ['Product', 'Order'] }),
  // ...
});
```

`custom` names are registered with `skipAutoRoutes: true` (a plugin serves those paths). Accepts a
record or an array of entity objects.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the build/changeset/`npm link` workflow.

## License

ISC — [Eleansphere](https://github.com/Eleansphere)
