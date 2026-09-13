---
"@eleansphere/entity-core": minor
---

Three additions, all passthrough to (or client-side counterparts of) new `@eleansphere/be-core`
features — requires `@eleansphere/be-core` with the matching minor:

- `FieldDef.hash?: 'bcrypt'` — passed through to be-core's `FieldConfig.hash`, typically paired
  with `writeOnly: true`.
- `EntityOptions.activeRange?: { from, to }` — passed through to be-core's `ModelConfig.activeRange`.
- `withImages(Base, refType)` — adds `listImages`/`uploadImage`/`deleteImage` to a generated
  service, the client side of be-core's detached file service convention
  (`refType`/`refId`/`role: 'image'`). Replaces hand-writing the same three methods per entity —
  `klotilda-service`'s `product`/`galleryItem` entities had verbatim-duplicate implementations.

Migration: none required — all three are opt-in.
