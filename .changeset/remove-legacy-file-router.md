---
"@eleansphere/be-core": major
---

Removed `createFileRouter` and `FileFieldConfig` — the legacy BLOB-in-database file router. Prefer
the detached file service (`AppConfig.storage` + `createFileServiceRouter`, an S3-compatible
bucket with only a `File` metadata row in Postgres), already used by every project on this. A grep
across every consumer repo found no remaining `serviceType: 'file'` entity, so nothing still uses
this path.

Migration: a project on `createFileRouter` needs to move its BLOB column to the detached file
service — see `@eleansphere/entity-core`'s `withImages` for the client side of that convention.
