import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app/error-handler';
import { AuthenticatedUser } from '../types/express-request';
import { hasAnyRole } from '../access/access-rules';
import { ACCESS_TOKEN_TYPE } from './tokens';

const BEARER_SCHEME = 'Bearer';

type AuthorizationHeader =
  { kind: 'absent' } | { kind: 'malformed' } | { kind: 'bearer'; token: string };

function readAuthorizationHeader(req: Request): AuthorizationHeader {
  const header = req.headers.authorization;
  if (!header) return { kind: 'absent' };
  const [scheme, token] = header.split(' ');
  return scheme === BEARER_SCHEME && token ? { kind: 'bearer', token } : { kind: 'malformed' };
}

function invalidToken(): HttpError {
  return new HttpError(401, 'Invalid or expired token');
}

/**
 * The user of a valid access token. Tokens signed with the same secret for another purpose (a
 * password-reset or e-mail verification link) carry a `purpose` and never pass as one; tokens
 * from before `typ` existed carry neither and still do until they expire.
 */
function decodeToken(token: string, jwtSecret: string): AuthenticatedUser {
  let claims: AuthenticatedUser & { typ?: unknown; purpose?: unknown };
  try {
    claims = jwt.verify(token, jwtSecret) as typeof claims;
  } catch {
    throw invalidToken();
  }
  const isAccessToken =
    claims.purpose === undefined &&
    (claims.typ === undefined || claims.typ === ACCESS_TOKEN_TYPE) &&
    claims.id !== undefined;
  if (!isAccessToken) throw invalidToken();
  return claims;
}

/** Requires a valid `Authorization: Bearer <jwt>` header and sets `req.user`. */
export function createVerifyToken(jwtSecret: string): RequestHandler {
  return function verifyToken(req: Request, _res: Response, next: NextFunction) {
    const header = readAuthorizationHeader(req);
    if (header.kind !== 'bearer') {
      return next(new HttpError(401, 'Authorization token is missing'));
    }
    try {
      req.user = decodeToken(header.token, jwtSecret);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Both names stay: `createVerifyToken` reads as "gate this route", `createExtractUser` as "make
// req.user available", even though they do the same thing.
export const createExtractUser = createVerifyToken;

/**
 * Sets `req.user` when a valid bearer token is sent and lets anonymous requests through, so access
 * policies decide per operation (a `public` read stays reachable without a token). A token that is
 * sent but invalid is still rejected with 401 instead of silently treating the caller as anonymous.
 */
export function createOptionalUser(jwtSecret: string): RequestHandler {
  return function optionalUser(req: Request, _res: Response, next: NextFunction) {
    const header = readAuthorizationHeader(req);
    if (header.kind === 'absent') return next();
    if (header.kind === 'malformed') {
      return next(new HttpError(401, 'Malformed authorization header'));
    }
    try {
      req.user = decodeToken(header.token, jwtSecret);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Allows only a signed-in user whose `role` claim is one of `roles`. Mount after
 * `createVerifyToken`; the role only reaches the token when `auth.tokenClaims` includes `'role'`.
 */
export function createRequireRole(...roles: string[]): RequestHandler {
  return function requireRole(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!hasAnyRole(req.user, roles)) return next(new HttpError(403, 'Insufficient role'));
    next();
  };
}
