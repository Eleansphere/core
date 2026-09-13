---
"@eleansphere/be-core": major
---

Renamed `GenericCrudOptions` → `CrudRouterOptions` — the `Generic` prefix was filler (there's no
non-generic variant to distinguish it from) and didn't match its file, `types/crud-router.ts`.

Migration: replace `GenericCrudOptions` with `CrudRouterOptions`. A grep across every consumer repo
found none importing this type directly (everyone just calls `createCrudRouter({...})` and lets
inference handle it) — nothing live needs to change.
