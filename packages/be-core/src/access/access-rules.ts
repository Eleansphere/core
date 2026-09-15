import type { Request } from 'express';
import type { WhereOptions } from 'sequelize';
import { OWNER_FIELD } from '@eleansphere/schema';
import type { AccessPolicy } from '@eleansphere/schema';
import { HttpError } from '../app/error-handler';
import type { AuthenticatedUser } from '../types/express-request';

const ADMIN_ROLE = 'admin';

/**
 * A per-request access decision, for rules a declarative policy can't express (e.g. "owner, or
 * anyone when the row is public"). Server-side only: pass it through `AppConfig.routes` or
 * `createCrudRouter`, never in a shared entity definition.
 *
 * - `true` allows the operation
 * - `false` denies it: 401 for an anonymous caller, 403 for a signed-in one
 * - a where-object allows it, limited to matching rows (ignored for create, which has no row yet)
 */
export type AccessDecider = (
  req: Request
) => boolean | WhereOptions | Promise<boolean | WhereOptions>;

export type AccessRule = AccessPolicy | AccessDecider;

export interface AccessRules {
  /** List and get-by-id. */
  read?: AccessRule;
  /** Create, update and delete. */
  write?: AccessRule;
}

export type CrudOperation = keyof AccessRules;

/** What an allowed request may touch. */
export interface AccessGrant {
  /** Where-clause every read, update and delete must also match. */
  scope?: WhereOptions;
  /** Owner stamped onto created rows. */
  ownerId?: string;
}

export function hasAnyRole(user: AuthenticatedUser, roles: readonly string[]): boolean {
  return typeof user.role === 'string' && roles.includes(user.role);
}

function rolesOf(policy: AccessPolicy): readonly string[] | undefined {
  if (policy === ADMIN_ROLE) return [ADMIN_ROLE];
  return typeof policy === 'object' ? policy.roles : undefined;
}

/** `true` for a role-based policy, which can only ever pass when tokens carry a `role` claim. */
export function requiresRoleClaim(rule: AccessRule | undefined): boolean {
  return rule !== undefined && typeof rule !== 'function' && rolesOf(rule) !== undefined;
}

function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  return req.user;
}

function grantPolicy(policy: AccessPolicy, req: Request): AccessGrant {
  if (policy === 'public') return {};
  const user = requireUser(req);
  if (policy === 'owner') return { scope: { [OWNER_FIELD]: user.id }, ownerId: user.id };
  const roles = rolesOf(policy);
  if (roles && !hasAnyRole(user, roles)) throw new HttpError(403, 'Insufficient role');
  return {};
}

async function grantDecision(decide: AccessDecider, req: Request): Promise<AccessGrant> {
  const decision = await decide(req);
  if (decision === false) {
    throw req.user
      ? new HttpError(403, 'Forbidden')
      : new HttpError(401, 'Authentication required');
  }
  return decision === true ? {} : { scope: decision };
}

/** Checks `rule` for this request: throws 401 or 403 when denied, else says what it may touch. */
export function evaluateAccess(rule: AccessRule, req: Request): Promise<AccessGrant> {
  return typeof rule === 'function'
    ? grantDecision(rule, req)
    : Promise.resolve().then(() => grantPolicy(rule, req));
}
