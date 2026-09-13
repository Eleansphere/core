---
"@eleansphere/entity-core": major
---

Removed `AbstractFileService`, and `defineEntity`'s `serviceType: 'file'` / `uploadField` options
(the legacy BLOB-upload path, paired with be-core's now-removed `createFileRouter`). `defineEntity`
now has a single overload instead of two. Also removed `AbstractServiceContainer` — superseded by
`createServiceContainer` since `2.0.0`; only the now-deleted `service-core` repo still referenced
it.

A grep across every consumer repo found nothing left using either.

Migration: an entity on `serviceType: 'file'` needs to move to be-core's detached file service —
see `withImages` for the client-side convention (`listImages`/`uploadImage`/`deleteImage` against
`/api/files`). Code on `AbstractServiceContainer` should move to `createServiceContainer`.
