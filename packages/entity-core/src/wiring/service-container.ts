/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AccessTokenSource } from '../http/http-transport';

type ServiceConstructor = abstract new (baseUrl: string, tokenSource: AccessTokenSource) => unknown;

/** A registry entry is either an entity object (its `.Service` is used) or a service class. */
type RegistryEntry = { Service: ServiceConstructor } | ServiceConstructor;

export type ServiceRegistry = Record<string, RegistryEntry>;

type IsAny<T> = 0 extends 1 & T ? true : false;

// Resolves a registry entry to its service *instance* type. A directly-passed service class, and
// a normal entity's `.Service`, resolve precisely; the `IsAny` branch is a defensive fallback for
// a loosely-typed (`any`) service class, which otherwise resolves to `unknown`.
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
 * Instantiates every service in `registry` with the same `baseUrl` and token source and returns a
 * plain typed object.
 *
 * ```ts
 * const session = new AuthSession({ baseUrl, storage: createWebSessionStorage('session') });
 * export const services = createServiceContainer(
 *   { auth: AuthService, books: bookEntity, loans: loanEntity },
 *   baseUrl,
 *   session, // or () => token — without automatic renewal
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
  tokenSource: AccessTokenSource
): ServiceContainer<R> {
  const container: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(registry)) {
    const entryCtor = typeof entry === 'function' ? entry : entry.Service;
    // Every real service class is concrete; `ServiceConstructor` is declared `abstract new` only
    // so loosely typed `.Service` classes fit the registry.
    const Service = entryCtor as new (baseUrl: string, tokenSource: AccessTokenSource) => unknown;
    container[key] = new Service(baseUrl, tokenSource);
  }
  return container as ServiceContainer<R>;
}
