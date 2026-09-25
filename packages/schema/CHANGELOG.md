# @eleansphere/schema

## 1.1.0

### Minor Changes

- 617eb47: Custom list filters, and the stored row for update hooks.

  - `query.customFilters` declares list filters that aren't a column, such as "books currently lent
    out": `{ lent: 'BOOLEAN' }`. be-core resolves each through `routes[model].customFilters`
    (`(value, req) => where`, async allowed) and ANDs the result into the list; a declared filter
    without a resolver, a resolver without a declaration or a name clash fails at startup.
    entity-core types them: `getAll({ filter: { lent: false } })`. Until now any such parameter was a
    400, so `buildWhere` could not read one.
  - `beforeUpdate` hooks receive the row as stored before the change as a third argument, so a rule
    spanning several fields can check `{ ...stored, ...data }` even when a PATCH sends only one.
  - be-core re-exports Sequelize's `Op` and the `WhereOptions` type, for where-clauses in custom
    filters, access functions and plugins.

## 1.0.0

### Major Changes

- 6fd3e96: Initial release: the zero-dependency field vocabulary shared by be-core and entity-core (ESM + CJS, runs in Node and the browser).

  - `FieldType` (now with `DATEONLY` and `ENUM`), `FieldConfig` (with `values` and `readOnly`), `ModelConfig` (with `access`, `query`, `indexes`), `AccessPolicy`, `QueryConfig`, `IndexConfig`.
  - `validateFields(fields, data, { mode: 'create' | 'patch' })` returns coded issues (`{ path, code, params }`) instead of English messages, so the server and a browser form apply exactly the same rules.
  - Calendar-date helpers for `DATEONLY` values: `isDateOnly`, `todayIn`, `toDateOnlyIn`, `addDays`, `daysBetween`, `compareDateOnly`.

### Minor Changes

- a5cd5aa: `references` on fields (`{ model, onDelete?: 'RESTRICT' | 'CASCADE' | 'SET NULL' }`) and the `reference` validation issue code.
