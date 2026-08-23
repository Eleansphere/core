---
"@eleansphere/be-core": minor
---

Add `FieldConfig.sensitive` — marking a field `sensitive: true` now strips it from every JSON
response (`toJSON()`) for that model, e.g. password hashes. Previously there was no way to hide
a field from API responses at runtime.
