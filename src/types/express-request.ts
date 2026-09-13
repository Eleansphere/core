/**
 * Augments Express's `Request` with `user` — the decoded JWT payload `createVerifyToken`/
 * `createExtractUser` attach after a valid token. Importing this (even just for the type) from
 * `index.ts` is what makes the `declare global` below apply to a consumer's own `req.user`
 * accesses, not just be-core's internals.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  // Augmenting `@types/express`'s own `Express.Request` requires its own ambient namespace —
  // there's no ES module syntax for merging into an existing namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
