# @eleansphere/entity-core

Define an entity **once** and derive its [be-core](https://github.com/Eleansphere/be-core) model config, its DTO
classes, and its [service-core](https://github.com/Eleansphere/service-core) service class from that single
definition — so the backend model, the DTOs, and the frontend service can never drift apart.

Extracted from `kniho-hlod-service`'s `defineEntity`, which wasn't actually kniho-hlod-specific — this is the same
code, generalized so other projects (Klotilda, and whatever comes next) don't have to reinvent it.

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
bookEntity.Service   // service-core-based service class — instantiate in your ServiceContainer
```

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

**Field types:** `STRING`, `TEXT`, `INTEGER`, `FLOAT`, `BOOLEAN`, `DATE`, `BLOB` — matches be-core's `FieldConfig`.
Any other be-core field validation (`unique`, `minLength`, `maxLength`, `min`, `max`, `format: 'email' | 'url'`)
passes straight through.

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

Same as be-core: all routes require a JWT, and `GET /` on the backend filters to the authenticated user's own
records (matched on `ownerId`, which the entity must define). On the frontend, the generated service class extends
`AbstractUserScopedCrudService` instead of the plain `AbstractCrudService`.

### Extending the generated service

```typescript
export const loanEntity = defineEntity({
  name: 'loan',
  prefix: 'l',
  userScoped: true,
  fields: { /* ... */ },
  extend: (Base) =>
    class extends (Base as any) {
      getByBook(bookId: string) {
        return this.get(`/api/loans?bookId=${bookId}`);
      }
    },
});
```

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the build/changeset/`npm link` workflow.

## License

ISC — [Eleansphere](https://github.com/Eleansphere)
