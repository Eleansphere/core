/* eslint-disable @typescript-eslint/no-explicit-any */
type ServiceConstructor = new (baseUrl: string, tokenProvider: () => string | null) => unknown;

/** A registry entry is either an entity object (its `.Service` is used) or a service class. */
type RegistryEntry = { Service: ServiceConstructor } | ServiceConstructor;

export type ServiceRegistry = Record<string, RegistryEntry>;

type IsAny<T> = 0 extends 1 & T ? true : false;

// Resolves a registry entry to its service *instance* type. `defineEntity` currently types
// `.Service` as `any`, so entity entries resolve to `any` (no worse than
// `InstanceType<typeof entity.Service>`); a service class passed directly resolves precisely.
type InstanceOfEntry<E> = E extends { Service: infer S }
  ? IsAny<S> extends true
    ? any
    : S extends new (...args: any[]) => infer I
      ? I
      : unknown
  : E extends new (...args: any[]) => infer I
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
    const Service: ServiceConstructor = typeof entry === 'function' ? entry : entry.Service;
    container[key] = new Service(baseUrl, tokenProvider);
  }
  return container as ServiceContainer<R>;
}
