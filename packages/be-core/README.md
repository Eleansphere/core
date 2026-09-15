# @eleansphere/be-core

Express + Sequelize (Postgres) backend framework. Declare models once and get tables, validated
CRUD routes with access control, list queries, JWT auth, an S3-compatible file service and email,
without writing the boilerplate per project.

The field vocabulary (`FieldType`, `ModelConfig`, `validateFields`, …) lives in
[`@eleansphere/schema`](../schema), shared with the browser through
[`@eleansphere/entity-core`](../entity-core).

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [AppConfig](#appconfig)
- [Models](#models)
  - [Fields](#fields)
  - [Access](#access)
  - [List queries](#list-queries)
  - [Indexes](#indexes)
  - [Server-side route overrides](#server-side-route-overrides)
  - [`skipAutoRoutes` and `activeRange`](#skipautoroutes-and-activerange)
- [Plugins](#plugins)
- [createCrudRouter](#createcrudrouter)
- [Auth](#auth)
- [File service](#file-service)
- [Errors](#errors)
- [Utilities](#utilities)
- [Development](#development)

## Installation

Published to GitHub Packages. Add an `.npmrc`:

```
@eleansphere:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
pnpm add @eleansphere/be-core
```

## Quick start

```typescript
import { createCore } from '@eleansphere/be-core';

const core = await createCore({
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  modelConfigs: [
    {
      name: 'book',
      prefix: 'bk_',
      userScoped: true,
      fields: {
        title: { type: 'STRING', required: true, maxLength: 200 },
        readingStatus: { type: 'ENUM', values: ['want', 'reading', 'read'], default: 'want' },
        finishedAt: { type: 'DATEONLY' },
      },
      query: { filter: { readingStatus: 'in' }, sort: ['title'], search: ['title'] },
    },
  ],
  auth: { modelName: 'user', tokenClaims: ['role'] },
});

await core.listen(); // port: config.port ?? 3000
```

That creates the `books` table (with an indexed `ownerId`) and mounts `/api/books`: only signed-in
users, each seeing their own rows, with `?readingStatus=read,reading&sort=title&q=dune&page=2`.

`createCore` returns `{ app, sequelize, models, emailService, storage, listen(), close() }` and
awaits the schema sync but never listens, so the same setup serves a scheduled job (use `models`,
then `close()`) and tests (`supertest(core.app)`). `createApp(config)` is the older one-call form:
it syncs, then listens, and returns the Express app immediately (startup errors are only logged).

## AppConfig

| Field | Type | Description |
|---|---|---|
| `databaseUrl` | `string` | Postgres connection string |
| `schema` | `string` | Postgres schema (sets `search_path`) |
| `dbSsl` | `boolean` | Connect over SSL. Default `true`; set `false` for a local database |
| `jwtSecret` | `string` | Signs and verifies JWTs |
| `port` | `number` | Default for `listen()`. Default `3000` |
| `modelConfigs` | `ModelConfig[]` | Declarative models, see [Models](#models) |
| `routes` | `Record<string, ModelRouteOverrides>` | Server-side additions to auto-mounted routes, see [overrides](#server-side-route-overrides) |
| `syncMode` | `'create' \| 'none'` | `create` (default) creates missing tables and indexes without altering existing ones |
| `plugins` | `ProjectPlugin[]` | Custom models and routes |
| `auth` | `AuthAppConfig` | Mounts `/api/auth`, see [Auth](#auth) |
| `storage` | `StorageConfig` | Enables the [file service](#file-service) |
| `email` | `EmailConfig` | SMTP settings for `emailService` |
| `cors` | `CorsOptions` | Passed to `cors` |
| `middleware` | `RequestHandler[]` | Registered before every route |
| `errorHandler` | `ErrorRequestHandler` | Replaces `defaultErrorHandler` |

## Models

A `ModelConfig` becomes a Sequelize model (with `id`, `createdAt`, `updatedAt`) and, unless
`skipAutoRoutes` is set, a CRUD router at `routePath` (default `/api/${name}s`):

| Method | Path | |
|---|---|---|
| `POST` | `/` | Create. `201` with the row |
| `GET` | `/` | List. `{ data, total }`, or `{ data, total, page, limit }` with a `query` config |
| `GET` | `/:id` | One row |
| `PATCH`, `PUT` | `/:id` | Partial update: only the fields sent are validated and changed |
| `DELETE` | `/:id` | `204` |

Request bodies never set `id`, `createdAt`, `updatedAt`, `readOnly` fields or (under an owner
policy) `ownerId`; they're stripped before validation.

### Fields

| Type | JSON value | Validations |
|---|---|---|
| `STRING`, `TEXT` | string | `minLength`, `maxLength`, `format: 'email' \| 'url'` (http/https) |
| `INTEGER`, `FLOAT` | number | `min`, `max` |
| `BOOLEAN` | boolean | |
| `DATE` | ISO timestamp | |
| `DATEONLY` | `YYYY-MM-DD` | |
| `ENUM` | one of `values` | stored as VARCHAR, so adding a value needs no migration |
| `BLOB` | binary | |

| Flag | Effect |
|---|---|
| `required` | Must be present on create (unless it has a `default`), can't be cleared |
| `unique` | Unique constraint; a violation is a `409` with a `unique` issue |
| `default` | Column default |
| `readOnly` | Server-managed: stripped from request bodies, returned in responses |
| `sensitive` | Stripped from responses (entity-core's `writeOnly` sets it) |
| `hash: 'bcrypt'` | Hashed before saving; values already hashed are left alone |

Validation runs [`validateFields`](../schema#validatefields) and answers
`400 { issues: [{ path, code, params }] }`.

### Access

```typescript
access: { read: 'public', write: 'admin' }
```

| Policy | Allows |
|---|---|
| `public` | anyone |
| `auth` | any signed-in user (**default** for every operation left out) |
| `owner` | signed-in user, only rows whose `ownerId` is theirs; creates are stamped with their id |
| `admin` | shorthand for `{ roles: ['admin'] }` |
| `{ roles: [...] }` | signed-in user whose token `role` is listed; needs `auth.tokenClaims: ['role']` (startup fails otherwise) |

`userScoped: true` means `owner` for both and adds the `ownerId` column. A caller outside a row's
scope gets `404`, not `403`, so ids don't leak. Tokens are read with `createOptionalUser`: an
anonymous request reaches `public` operations, an invalid token is always `401`.

Rules a literal can't express (e.g. "owner, or anyone when the row is public") are functions,
passed server-side through [`routes`](#server-side-route-overrides):

```typescript
routes: {
  book: {
    access: {
      read: (req) => ({ [Op.or]: [{ ownerId: req.user?.id ?? null }, { visibility: 'public' }] }),
    },
  },
}
```

A function returns `true` (allow), `false` (deny: `401` anonymous, `403` signed in) or a
where-clause that limits the rows.

### List queries

```typescript
query: {
  filter: { readingStatus: 'in', rating: 'range', finishedAt: 'isNull', createdAt: 'range' },
  sort: ['title', 'rating'],
  defaultSort: '-createdAt',
  search: ['title', 'author'],
  defaultLimit: 20,
  maxLimit: 100,
}
```

| Request | Meaning |
|---|---|
| `?readingStatus=read` / `?readingStatus=read,reading` | `eq` / `in` |
| `?rating[gte]=3&rating[lt]=5` | `range` (`gte`, `lte`, `gt`, `lt`, or a plain value) |
| `?finishedAt[isNull]=false` | `isNull` |
| `?sort=-rating,title` | order; `id` is always appended as a tie-breaker |
| `?q=dune` | case-insensitive substring in any `search` column (`%` and `_` are literal) |
| `?page=2&limit=20` | pagination; `limit` above `maxLimit` is clamped |

Values are checked against the field types. Undeclared parameters, unsortable columns and values of
the wrong type are `400`. `id`, `ownerId`, `createdAt` and `updatedAt` can be listed too.

### Indexes

```typescript
indexes: [{ fields: ['bookId'], unique: true, where: { returnedAt: null } }]
```

`where` makes the index partial (`null` means `IS NULL`). The example allows one active loan per
book, enforced by Postgres even under concurrent requests (the second insert is a `409`).

### Server-side route overrides

`AppConfig.routes[modelName]` adds what doesn't belong in a shared model definition: access
functions, `hooks` (run after field validation), `enrich`, `buildWhere`, `beforeDelete`,
`middleware`, `protect`.

```typescript
routes: {
  book: {
    enrich: (rows) => attachFiles(models.File, storage, 'book', rows, { role: 'cover', as: 'cover' }),
    buildWhere: (req) => (req.query.shelfId ? { id: { [Op.in]: booksOnShelf(req) } } : {}),
  },
}
```

### `skipAutoRoutes` and `activeRange`

`skipAutoRoutes: true` registers the model without CRUD routes, for a plugin to serve.
`activeRange: { from, to }` mounts a public `GET <routePath>/active` returning rows with
`from <= now <= to`, even with `skipAutoRoutes`.

## Plugins

```typescript
import type { ProjectPlugin } from '@eleansphere/be-core';

export const statsPlugin: ProjectPlugin = {
  registerModels(sequelize) {
    // optional: models not described by a ModelConfig
  },
  registerRoutes(app, sequelize, models, emailService, storage) {
    app.get('/api/stats', createVerifyToken(process.env.JWT_SECRET!), async (req, res, next) => {
      try {
        res.json({ books: await models.book.count({ where: { ownerId: req.user!.id } }) });
      } catch (err) {
        next(err);
      }
    });
  },
};
```

Plugin routes are mounted after the model routes, then the error handler.

## createCrudRouter

The router behind every auto-mounted model, usable directly in a plugin:

```typescript
app.use(
  '/api/products',
  createCrudRouter({
    model: models.Product,
    prefix: 'prod_',
    generateId,
    authenticate: createOptionalUser(jwtSecret), // resolves req.user for the access rules
    access: { read: 'public', write: 'admin' },  // policies or functions
    query: { filter: { category: 'eq' }, sort: ['price'] },
    fields: productConfig.fields,                // types for query values
    readOnlyFields: ['stockReserved'],
    hashFields: ['password'],
    hooks: { beforeCreate: async (data, req) => data, beforeUpdate: async (data, req) => data },
    buildWhere: (req) => ({ active: true }),
    enrich: (rows) => attachFiles(models.File, storage, 'Product', rows, { as: 'images' }),
    beforeDelete: async (product, req) => cleanUpImages(product),
  })
);
```

Without `access` (and without `userScoped`) the router is open and only `protect` (on
POST/PUT/PATCH/DELETE) and `middleware` (all routes) guard it. Without `query`, `GET /` returns
every row, or one page when both `?page` and `?limit` are sent, ordered by the `order` option.

## Auth

`AppConfig.auth` mounts `/api/auth` on the model named `modelName` (needs `email`, `password` and,
for role policies, `role` columns):

| Method | Path | |
|---|---|---|
| `POST` | `/login` | `{ email, password }` → `{ token, id, email, role }` |
| `GET` | `/me` | `{ id, email }` from the token |
| `POST` | `/register` | when `register` is set |
| `POST` | `/change-password` | when `changePassword: true`; JWT required |
| `POST` | `/forgot-password`, `/reset-password` | when `passwordReset` is set; emails need `AppConfig.email` |

`tokenClaims` copies user columns into the JWT next to `id` and `email`, available as
`req.user.role` etc. `expiresIn` defaults to `30m`.

Middleware for custom routes:

- `createVerifyToken(secret)` (alias `createExtractUser`): requires `Authorization: Bearer <jwt>`, sets `req.user`
- `createOptionalUser(secret)`: sets `req.user` when a valid token is sent, lets anonymous requests through, rejects invalid tokens
- `createRequireRole(...roles)`: after one of the above, `403` unless `req.user.role` is listed
- `evaluateAccess(rule, req)`: checks an access policy or function, returns `{ scope, ownerId }`

## File service

Set `AppConfig.storage` to keep file bytes in an S3-compatible bucket (Cloudflare R2, S3, MinIO)
and only metadata rows in Postgres. be-core registers a `File` model and mounts `/api/files`.

```typescript
storage: {
  s3: {
    endpoint: process.env.R2_ENDPOINT!,
    bucket: process.env.R2_BUCKET!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  },
  writeMiddleware: [createVerifyToken(process.env.JWT_SECRET!)],
},
```

| Field | Default | |
|---|---|---|
| `s3.endpoint`, `s3.bucket`, `s3.accessKeyId`, `s3.secretAccessKey` | | bucket connection |
| `s3.region` | `'auto'` | |
| `s3.publicBaseUrl` | | CDN base URL for public files |
| `s3.forcePathStyle` | `false` | |
| `writeMiddleware` | `[]` | guards `POST` and `DELETE`; **set it**, uploads are open otherwise |
| `preferRedirect` | `true` | redirect public files to the CDN instead of proxying |
| `maxFileSize` | 25 MiB | |
| `routePath` | `/api/files` | |

| Method | Path | |
|---|---|---|
| `POST` | `/api/files` | multipart `file` + `refType`, `refId`, `role`, `visibility`, `sortOrder` → `FileDto` |
| `GET` | `/api/files?refType=&refId=&role=` | `{ data: FileDto[], total }` |
| `GET` | `/api/files/:id` | redirect (public) or stream with `ETag` / `Range` |
| `GET` | `/api/files/:id/meta` | `FileDto` |
| `DELETE` | `/api/files/:id` | removes bytes and row |

`attachFiles(models.File, storage, refType, rows, { role, as })` batch-loads the files of many rows
in one query; use it in `enrich`.

## Errors

Routes throw `HttpError(status, message)` (or `ValidationError(issues)`); `defaultErrorHandler`
answers:

```json
{ "error": "Bad Request", "message": "Validation failed", "statusCode": 400,
  "issues": [{ "path": "title", "code": "minLength", "params": { "minLength": 2 } }] }
```

Sequelize unique and foreign-key violations become `409`, a unique violation with a `unique` issue
per column. 5xx errors are logged and answered with a generic message.

## Utilities

- `generateId(prefix)`: `prefix` + 32 hex characters, no separator added (`generateId('bk_')` → `bk_9f…`)
- `parseListQuery(req.query, queryConfig, fields)`: the list-query parser, for plugin routes
- `combineWhere(...clauses)`: ANDs where-clauses, skipping empty ones
- `validateFields` and the field types, re-exported from `@eleansphere/schema`
- `CoreEntity`: base Sequelize model with `id`, `createdAt`, `updatedAt`; `Model.initModel(sequelize, attributes, options)`
- `createEmailService(emailConfig)`: `send({ to, subject, html, text })` over SMTP

## Development

In the [core monorepo](../../README.md):

```bash
docker compose up -d                              # Postgres on localhost:5433 for the integration tests
corepack pnpm --filter @eleansphere/be-core build
corepack pnpm --filter @eleansphere/be-core test  # TEST_DATABASE_URL overrides the local default
```

Releases go through changesets; see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

ISC — [Eleansphere](https://github.com/Eleansphere)
