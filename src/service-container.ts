/* eslint-disable @typescript-eslint/no-explicit-any */
type ServiceConstructor = abstract new (baseUrl: string, tokenProvider: () => string | null) => unknown;

/** A registry entry is either an entity object (its `.Service` is used) or a service class. */
type RegistryEntry = { Service: ServiceConstructor } | ServiceConstructor;

export type ServiceRegistry = Record<string, RegistryEntry>;

type IsAny<T> = 0 extends 1 & T ? true : false;

// Resolves a registry entry to its service *instance* type. A directly-passed service class, and
// a normal entity's `.Service`, resolve precisely; a `serviceType: 'file'` entity's `.Service` is
// `AnyConstructor` and resolves to `any` (unchanged legacy behaviour).
type InstanceOfEntry<E> = E extends { Service: infer S }
  ? IsAny<S> extends true
    ? any
    : S extends abstract new (...args: any[]) => infer I
      ? I
      : unknown
  : E extends abstract new (...args: any[]) => infer I
    ? I
    : never;

export type ServiceContainer<R extends ServiceRegistry> = {
  readonly [K in keyof R]: InstanceOfEntry<R[K]>;
};

/**
 * Instantiates every service in `registry` with the same `baseUrl` + `tokenProvider` and returns
 * a plain typed object — replacing hand-written `AbstractServiceContainer` subclasses where each
 * `this.x = new X(...this.args())` line could drift from the entity list.
 *
 * ```ts
 * export const services = createServiceContainer(
 *   { auth: AuthService, books: bookEntity, loans: loanEntity },
 *   import.meta.env.VITE_BACKEND_URL,
 *   () => localStorage.getItem('token'),
 * );
 * services.books.getAll();
 * ```
 *
 * Registry values are either a service class (`AuthService`) or an entity object from
 * `defineEntity` (its `.Service` is instantiated).
 */
export function createServiceContainer<R extends ServiceRegistry>(
  registry: R,
  baseUrl: string,
  tokenProvider: () => string | null
): ServiceContainer<R> {
  const container: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(registry)) {
    const entryCtor = typeof entry === 'function' ? entry : entry.Service;
    // Every real service class is concrete; `ServiceConstructor` is declared `abstract new` only
    // so `AnyConstructor`-typed `.Service` (file entities) fits the registry.
    const Service = entryCtor as new (baseUrl: string, tokenProvider: () => string | null) => unknown;
    container[key] = new Service(baseUrl, tokenProvider);
  }
  return container as ServiceContainer<R>;
}
