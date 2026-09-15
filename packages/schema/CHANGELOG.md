# @eleansphere/schema

## 1.0.0-next.0

### Major Changes

- 6fd3e96: Initial release: the zero-dependency field vocabulary shared by be-core and entity-core (ESM + CJS, runs in Node and the browser).

  - `FieldType` (now with `DATEONLY` and `ENUM`), `FieldConfig` (with `values` and `readOnly`), `ModelConfig` (with `access`, `query`, `indexes`), `AccessPolicy`, `QueryConfig`, `IndexConfig`.
  - `validateFields(fields, data, { mode: 'create' | 'patch' })` returns coded issues (`{ path, code, params }`) instead of English messages, so the server and a browser form apply exactly the same rules.
  - Calendar-date helpers for `DATEONLY` values: `isDateOnly`, `todayIn`, `toDateOnlyIn`, `addDays`, `daysBetween`, `compareDateOnly`.

### Minor Changes

- a5cd5aa: `references` on fields (`{ model, onDelete?: 'RESTRICT' | 'CASCADE' | 'SET NULL' }`) and the `reference` validation issue code.
