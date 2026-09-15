# @eleansphere/entity-core

The client-side toolkit for [be-core](https://github.com/Eleansphere/be-core) apps.

Define an entity **once** and derive its be-core model config, its DTO classes, and its HTTP
service from that single definition — so the backend model, the DTOs, and the frontend service can
never drift apart. Plus the HTTP layer those services are built on (`ApiClient`, the abstract
service classes, `AuthService`) and the wiring helpers (`createServiceContainer`, `toModelConfigs`).

> **2.0.0** absorbed `@eleansphere/service-core` (now a deleted repo) — `ApiClient`, the abstract
> service classes, `AuthService`, `PaginatedResponse`, `FileDto`, etc. all come from here now.
> `extend` is fully typed.

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

`InstanceType<typeof bookEntity.Service>` is the CRUD surface — `getAll` returns
`Promise<PaginatedResponse<InferDto<…>>>`, plus `getById` / `create` / `update` / `delete` — and, for an
`extend`-ed entity, whatever the `extend` block added.

### Options

| Option        | Type                | Description                                                          |
| ------------- | ------------------- | ---------------------------------------------------------------------- |
| `name`        | `string`             | Entity name — Sequelize model name, default route path base           |
| `prefix`      | `string`             | ID prefix (`'b'` → `'b_abc123...'`)                                   |
| `basePath`    | `string`             | Frontend HTTP base path (default `/api/{name}s`)                     |
| `routePath`   | `string`             | Override backend route path if it differs from `basePath`             |
| `userScoped`  | `boolean`            | Backend only — be-core stamps/enforces `ownerId` (entity needs an `ownerId` field) |
| `activeRange` | `{ from, to }`       | Backend mounts a public `GET {basePath}/active` route (be-core `ModelConfig.activeRange`) |
| `fields`      | `Fields`             | Field definitions — see below                                         |
| `extend`      | `(Base) => class`    | Add custom methods to the generated service class (see below)         |

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

### `hash` — bcrypt on create/update

```typescript
password: { type: 'STRING', required: true, minLength: 6, writeOnly: true, hash: 'bcrypt' },
```

`hash: 'bcrypt'` hashes the field server-side (be-core) on create/update, skipping values that
already look like a bcrypt hash — so resubmitting an unchanged password on update doesn't hash it
twice. Typically paired with `writeOnly: true`. `minLength`/`maxLength` etc. validate the plaintext
value before it's hashed.

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

### `withImages` — the client side of be-core's detached file service

An entity whose records have attached images (product photos, gallery items, …) needs
`listImages`/`uploadImage`/`deleteImage` against be-core's generic `/api/files` endpoint
(`refType`/`refId`/`role: 'image'`). Wrap `extend`'s `Base` with `withImages` instead of
hand-writing the same three methods per entity:

```typescript
import { defineEntity, withImages } from '@eleansphere/entity-core';

export const productEntity = defineEntity({
  name: 'Product',
  prefix: 'prod',
  fields: { /* ... */ },
  extend: (Base) =>
    class extends withImages(Base, 'Product') {
      // entity-specific overrides/additions still go here
    },
});
```

`productEntity.Service`'s instances get `listImages(refId)`, `uploadImage(refId, file, sortOrder?)`,
and `deleteImage(fileId)` — the backend side is be-core's `attachFiles` in the model config's
`enrich` option. `withImages` is a thin `role: 'image'` convenience over `FilesClient`.

## HTTP layer

Split by concern instead of one class doing everything:

| Class | Role |
| --- | --- |
| `HttpTransport` | fetch + auth headers + turning a non-2xx response into an `ApiError`. Base class only — extend it to build a new kind of client. |
| `ApiClient` | the CRUD JSON verbs (`get`/`post`/`put`/`httpDelete`) every generated entity service and `AuthService` extend. |
| `FilesClient` | client for be-core's detached file service (`/api/files`): `list(params)` / `upload(fields)` / `remove(fileId)`. Not part of the generated-service chain — files aren't a CRUD resource. Construct one directly for anything `withImages` doesn't cover (an arbitrary `role`, no fixed `refType`, …). |

### `ApiError`

Thrown for any non-2xx response — `status`, the parsed `body`, and `isAuthError`/`isNotFound`
getters, instead of a bare `Error` with a message string to match against:

```typescript
try {
  await productEntity.Service.getById(id);
} catch (err) {
  if (err instanceof ApiError && err.isAuthError) {
    logout();
  }
}
```

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
