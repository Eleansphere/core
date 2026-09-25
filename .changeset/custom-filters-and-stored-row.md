---
'@eleansphere/schema': minor
'@eleansphere/be-core': minor
'@eleansphere/entity-core': minor
---

Custom list filters, and the stored row for update hooks.

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
