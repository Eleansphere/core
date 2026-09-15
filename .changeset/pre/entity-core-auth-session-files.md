---
'@eleansphere/entity-core': major
---

Token renewal, file slots and the auth v3 client.

**New**

- `AuthSession` (with `createWebSessionStorage` / `createMemorySessionStorage`): pass it to `createServiceContainer` instead of a token function. A request answered with 401 is retried once after a refresh shared by every request failing at the same time; tokens renewed by another tab are reused instead of refreshed again. `onSessionExpired` fires when the refresh token is rejected.
- `AuthService`: `register`, `updateMe`, `deleteMe`, `changePassword`, `refresh`, `logout`. `LoginResponse` carries `refreshToken` and `user`.
- `withFiles(Base, refType, roles)` adds `files(role)` with `list` / `upload` / `remove`; `withImages` is now built on it.
- `references` on field definitions.
- `ApiClient.httpDelete(path, body?)`; empty (`204`) responses resolve to `undefined`.

**Breaking**

- `tokenProvider` is now `tokenSource` (a token function or an `AuthSession`) on `HttpTransport` / `ApiClient` and in `extend` bodies (`this.tokenSource`).
- `AuthService` generics are `<TUser, TRegister, TProfile>`, and `me()` returns the full user.
- `withImages` no longer exposes a `files` getter returning a `FilesClient` (`files(role)` is the slot API). `FilesListParams.ownerId` is gone. `FileUploadFields.file` accepts any `Blob`.
