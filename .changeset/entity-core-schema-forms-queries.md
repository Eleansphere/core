---
'@eleansphere/entity-core': major
---

Built on `@eleansphere/schema` instead of be-core, with typed list queries and form schemas.

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
