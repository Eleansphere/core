---
'@eleansphere/be-core': patch
---

`MemoryStorageAdapter` no longer invents a public URL (`https://storage.invalid/…`). Without a
`publicBaseUrl`, `getPublicUrl` returns `undefined`, as the `StorageAdapter` contract says, so file
DTOs point at the file service's own `/api/files/:id` — which streams the bytes — and uploaded
images load in local development and in apps running without a bucket. Pass a base URL
(`new MemoryStorageAdapter('https://cdn.test')`) to exercise the CDN redirect in tests.
