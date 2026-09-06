---
"@eleansphere/be-core": minor
---

`userScoped` models now enforce ownership on every auto-generated route, not just `GET /`.

Previously `userScoped: true` only filtered the list endpoint by `ownerId`. `GET /:id`, `PUT /:id`
and `DELETE /:id` did no ownership check, and `POST /` trusted whatever `ownerId` the client sent —
so any authenticated user could read, modify or delete another user's records by id, or create
records owned by someone else.

`createCrudRouter` now, when `userScoped`:

- **`POST /`** — sets `ownerId` from the JWT before validation and hooks run; a client-supplied
  `ownerId` is overwritten.
- **`GET /:id` / `PUT /:id` / `DELETE /:id`** — return `404` (not `403`, to avoid leaking which ids
  exist) unless the caller owns the record.
- **`PUT /:id`** — pins `ownerId` to the current owner, so an update can't hand the record to
  another user.

Migration: none required. Clients may stop sending `ownerId` in create/update bodies, but sending
it still works (it's ignored). Any code that relied on cross-user access through the generic CRUD
routes of a `userScoped` model was a bug and now returns `404`.
