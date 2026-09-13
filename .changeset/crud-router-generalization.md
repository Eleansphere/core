---
"@eleansphere/be-core": minor
---

`createCrudRouter` (and `ModelConfig`) grow generic hooks for shapes that previously had to be
hand-rolled per project: public-read-protected-write CRUD, row enrichment (attached files),
custom list filters/order, and delete side effects.

- `protect` — auth middleware applied only to `POST`/`PUT`/`DELETE`; `GET` (list + by id) stays
  public. `middleware` keeps applying to all five routes as before — this is purely additive.
- `buildWhere(req)` — extra `where` filter for the list route, merged with the `userScoped`
  `ownerId` filter when both are present.
- `order` — Sequelize `order` shape for the list route (e.g. `[['sortOrder', 'ASC']]`).
- `enrich(rows)` — transforms fetched row(s) before the response is sent (e.g. `attachFiles`),
  applied consistently to list, get-by-id, create and update responses.
- `beforeDelete(entity, req)` — runs before the record is destroyed, for cleaning up related
  data (e.g. deleting a product's image files from storage before the product row).
- `hashFields` — field names to bcrypt-hash on create/update, skipping values that already look
  like a bcrypt hash. `ModelConfig.fields[name].hash: 'bcrypt'` drives this automatically for
  auto-mounted routes (see the `hash` field flag, also in this release).
- `ModelConfig.activeRange: { from, to }` — mounts a public `GET {routePath}/active` route
  returning records where `from <= now <= to`, ordered by `from` ascending. Mounted even when
  `skipAutoRoutes` is set, since that flag only opts a model out of the CRUD routes.

Migration: none required — every new option is optional and additive.
