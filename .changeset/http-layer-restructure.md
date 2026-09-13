---
"@eleansphere/entity-core": major
---

Split the client HTTP layer by concern instead of one growing `ApiClient`:

- **`ApiError`** (new) — thrown for any non-2xx response instead of a bare `Error`. Carries `status`
  and the parsed `body`, plus `isAuthError`/`isNotFound` getters, so callers can branch on real
  state instead of matching on `err.message` strings.
- **`HttpTransport`** (new) — the actual fetch/auth-header/error-handling plumbing. `ApiClient` and
  `FilesClient` both extend it; nothing else needs to.
- **`ApiClient`** — now just `get`/`post`/`put`/`httpDelete`, the CRUD JSON verbs every generated
  service and `AuthService` are built on. **Removed `uploadFile` and `uploadMultipart`** — file
  upload isn't a CRUD-JSON-client concern; see `FilesClient` below. (`uploadFile` was already dead
  code, left over from the removed `AbstractFileService`; `uploadMultipart` is superseded by
  `FilesClient`.) `extend`'s `Base`/`ExtendableService` no longer exposes either on `this` —
  nothing in any consumer repo used them directly (everything went through `withImages`).
- **`FilesClient`** (new) — client for be-core's detached file service (`/api/files`):
  `list(params)`, `upload(fields)`, `remove(fileId)`. Not part of the generated-service
  inheritance chain (files aren't a CRUD resource) — construct one with the same
  `baseUrl`/`tokenProvider` an entity service uses, or go through `withImages` for the common
  `role: 'image'` case, which now builds one internally instead of calling `this.uploadMultipart`.

Migration: `withImages`'s own signature and behavior are unchanged. Code calling
`this.uploadFile(...)` or `this.uploadMultipart(...)` directly from an `extend` block (nothing in
any consumer repo does) should use `FilesClient` (or `withImages`) instead. Code catching upload
errors by `err.message` should switch to `err instanceof ApiError` and `err.status`/`isAuthError`.
