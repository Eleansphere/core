---
"@eleansphere/entity-core": major
---

**`@eleansphere/service-core` is merged into this package.** `@eleansphere/entity-core` now also
exports `ApiClient`, `AbstractCrudService`, `AbstractAuthService`, `AbstractFileService`,
`AuthService`, `AbstractServiceContainer`, `PaginationParams`, `PaginatedResponse`, `FileDto`,
`FileVisibility`, `LoginRequest`, `LoginResponse`, `AuthUser` — everything `service-core` had.
It no longer depends on `@eleansphere/service-core`.

Migration: repoint `@eleansphere/service-core` imports to `@eleansphere/entity-core` and drop the
`@eleansphere/service-core` dependency. `service-core@2.0.0` is a re-export shim of this package,
so consumers can migrate one at a time. Every current consumer already declares `service-core`
directly, so removing it from this package's deps orphans no one.

**`extend` is fully typed.** `extend`'s `Base` is now `ExtendableService<TFields>` — a `new`-able
class whose `this` exposes the CRUD methods and the HTTP helpers (`this.get`, `this.post`,
`this.basePath`, `this.uploadMultipart`, …) with real types:

```ts
extend: (Base) =>
  class extends Base {
    getByBook(bookId: string) {
      return this.get<LoanDto[]>(`${this.basePath}?bookId=${bookId}`);
    }
  }
```

The added methods land on `InstanceType<typeof entity.Service>` alongside the inherited CRUD, so
`getServices().loans.getByBook(...)` **and** `.getAll(...)` are both typed. The old
`class extends (Base as any)` / `(this as any)` style still compiles — dropping the casts is an
opt-in per entity file. `ApiClient`'s HTTP methods and `baseUrl` are now `public` (the generated
service's *public* type still surfaces only CRUD; this only makes them reachable inside an
`extend` subclass body).

Other:

- `AbstractUserScopedCrudService` is now a `@deprecated` alias of `AbstractCrudService` (it never
  added anything — `userScoped` is enforced server-side by be-core).
- `@eleansphere/be-core` bumped to `^1.12.0`.
- Build target `es2020`, `lib` includes `DOM` (for `ApiClient`'s `fetch` / `FormData` / `File`).
