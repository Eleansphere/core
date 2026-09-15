# @eleansphere/entity-core

The client-side toolkit for [be-core](../be-core) apps. Define an entity **once** and derive its
server model config, its DTO types, a typed HTTP service and a form schema from that one
definition, so the database, the API, the frontend service and its forms can't drift apart.

Runs in the browser and in Node, ships ESM and CJS, and depends only on
[`@eleansphere/schema`](../schema) (not on be-core, so a frontend doesn't install Express or
Sequelize).

## Installation

```
@eleansphere:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
pnpm add @eleansphere/entity-core
```

## defineEntity

```typescript
import { defineEntity } from '@eleansphere/entity-core';

export const bookEntity = defineEntity({
  name: 'book',
  prefix: 'bk_',
  userScoped: true,
  fields: {
    title: { type: 'STRING', required: true, maxLength: 200 },
    author: { type: 'STRING', maxLength: 100 },
    readingStatus: { type: 'ENUM', values: ['none', 'want', 'reading', 'read'], default: 'none' },
    rating: { type: 'INTEGER', min: 1, max: 5 },
    finishedAt: { type: 'DATEONLY' },
    lastReminderSentAt: { type: 'DATE', readOnly: true },
  },
  query: {
    filter: { readingStatus: 'in', rating: 'range' },
    sort: ['title', 'rating', 'createdAt'],
    defaultSort: '-createdAt',
    search: ['title', 'author'],
  },
  indexes: [{ fields: ['ownerId', 'title'] }],
});
```

No `as const` needed: literals are inferred. One definition gives you:

| | |
|---|---|
| `bookEntity.config` | be-core `ModelConfig`, via `toModelConfigs(allEntities)` into `createCore` |
| `bookEntity.fields` | the field definitions, e.g. for `toStandardSchema` |
| `bookEntity.Dto`, `.CreateDto`, `.UpdateDto` | DTO classes; `InstanceType<typeof bookEntity.Dto>` is the row type |
| `bookEntity.Service` | typed HTTP service, registered with `createServiceContainer` |

### Options

| Option | Description |
|---|---|
| `name`, `prefix` | Model name and id prefix (include the separator: `'bk_'`) |
| `basePath` | Service base path, default `/api/{name}s`; also the server route unless `routePath` differs |
| `routePath` | Server route path, when different from `basePath` |
| `userScoped` | Rows belong to the signed-in user: owner access, an `ownerId` column, `ownerId` in the DTO |
| `access` | `{ read, write }` policies: `public`, `auth` (default), `owner`, `admin`, `{ roles }` |
| `query` | List filters, sort and search the API accepts; column names are type-checked, and it types `getAll` |
| `indexes` | Indexes, including partial ones (`where: { returnedAt: null }`) |
| `activeRange` | `{ from, to }` fields: public `GET {basePath}/active` |
| `fields` | Field definitions, see below |
| `extend` | `(Base) => class extends Base { … }` to add service methods |

### Fields and DTO types

Types: `STRING`, `TEXT`, `INTEGER`, `FLOAT`, `BOOLEAN`, `DATE` (ISO string), `DATEONLY`
(`YYYY-MM-DD`), `ENUM` (needs `values`, typed as their union), `BLOB`. Validations: `required`
(literal `true`), `unique`, `minLength`, `maxLength`, `min`, `max`, `format: 'email' | 'url'`,
`default`.

| Flag | Read DTO | Create / update DTO | Server |
|---|---|---|---|
| `writeOnly: true` | excluded (also stripped by `new Dto(data)`) | included | stripped from responses |
| `readOnly: true` | included | excluded | stripped from request bodies |
| `hash: 'bcrypt'` | | | hashed before saving |

- **Read DTO**: `id`, `createdAt`, `updatedAt` always; `ownerId` for `userScoped`; required fields and
  fields with a default are non-null, the rest `T | null`.
- **Create DTO**: required fields without a default are mandatory, the rest optional (non-required
  ones may be `null`).
- **Update DTO**: everything optional; `update()` sends `PATCH`, so only what you send changes.

## Typed services

```typescript
const books = services.books; // from createServiceContainer

await books.getAll({
  filter: { readingStatus: ['reading', 'read'], rating: { gte: 4 } },
  sort: ['-rating', 'title'],
  q: 'dune',
  page: 1,
  limit: 20,
});
// → PaginatedResponse<Book>: { data, total, page, limit }

await books.create({ title: 'Dune' });
await books.update(id, { rating: 5 });
```

Filters and sort columns are exactly what the entity's `query` declares: an undeclared filter, an
unknown ENUM value or an unsortable column is a compile error. Filter values: a value (`eq`), a
list (`in`), `{ gte, lte, gt, lt }` (`range`), `{ isNull: boolean }` (`isNull`).
`toListQueryParams` does the serialization, for hand-written services.

### Extending a service

`Base` is a real class; `this` has the CRUD methods and the HTTP helpers (`get`, `post`, `put`,
`patch`, `httpDelete`, `basePath`), all typed:

```typescript
export const loanEntity = defineEntity({
  name: 'loan',
  prefix: 'ln_',
  userScoped: true,
  fields: { /* ... */ },
  extend: (Base) =>
    class extends Base {
      markReturned(id: string) {
        return this.post<LoanDto>(`${this.basePath}/${id}/return`, {});
      }
    },
});
```

### withImages

`extend: (Base) => class extends withImages(Base, 'Product') {}` adds `listImages(refId)`,
`uploadImage(refId, file, sortOrder?)` and `deleteImage(fileId)` over be-core's file service
(`role: 'image'`). For other roles use `FilesClient` directly: `list`, `upload`, `remove`.

## Forms: toStandardSchema

```vue
<script setup lang="ts">
import { toStandardSchema } from '@eleansphere/entity-core';

const schema = toStandardSchema(loanEntity.fields, 'create', {
  formatMessage: (issue) => t(`validation.${issue.code}`, issue.params ?? {}),
  refine: (loan) =>
    loan.dueAt && loan.dueAt < loan.lentAt ? [{ path: 'dueAt', code: 'min' }] : [],
});
</script>

<template>
  <UForm :schema="schema" :state="state" @submit="save">…</UForm>
</template>
```

A [Standard Schema](https://standardschema.dev) running the same `validateFields` as the server:
`'create'` checks every field, `'patch'` only those present. Each issue has `path`, `message`,
`code` and `params`. `refine` runs once the fields are valid on their own.

## HTTP layer

| Class | Role |
|---|---|
| `HttpTransport` | `fetch`, auth header, non-2xx → `ApiError`; base for new clients |
| `ApiClient` | `get` / `post` / `put` / `patch` / `httpDelete`; base of every service |
| `CrudServiceBase` | `getAll` / `getById` / `create` / `update` / `delete` for hand-written services |
| `AuthService` | `login` (→ `{ token, id, email, role }`), `me`, `forgotPassword`, `resetPassword` |
| `FilesClient` | be-core's `/api/files` |

`ApiError` carries `status`, the parsed `body`, `isAuthError` (401/403), `isNotFound`, `detail`
(the server's message) and `issues` (validation issues, empty otherwise):

```typescript
try {
  await books.create(form);
} catch (err) {
  if (err instanceof ApiError && err.issues.length) showFieldErrors(err.issues);
}
```

## Wiring helpers

```typescript
// frontend
export const services = createServiceContainer(
  { auth: AuthService, books: bookEntity, loans: loanEntity },
  import.meta.env.VITE_API_URL,
  () => session.token
);

// backend
const core = await createCore({ modelConfigs: toModelConfigs(allEntities, { custom: ['user'] }), … });
```

`createServiceContainer` instantiates each service class or entity `.Service` with the same base
URL and token provider. `toModelConfigs` turns an entity registry into `ModelConfig[]`; `custom`
names get `skipAutoRoutes`.

## Development

In the [core monorepo](../../README.md): `corepack pnpm --filter @eleansphere/entity-core build`,
`… test`, `… typecheck` (type-level tests use `expectTypeOf` and `@ts-expect-error`, so the
typecheck is part of the test suite). Releases go through changesets; see
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

ISC — [Eleansphere](https://github.com/Eleansphere)
