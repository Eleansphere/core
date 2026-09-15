import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Model } from 'sequelize';
import { HttpError } from '../app/error-handler';

const PASSWORD_RESET_PURPOSE = 'password-reset';
const PASSWORD_VERSION_LENGTH = 16;

export const USER_ID_FIELD = 'id';
export const USER_EMAIL_FIELD = 'email';
export const USER_PASSWORD_FIELD = 'password';

interface PasswordResetClaims {
  sub: string;
  purpose: string;
  /** Fingerprint of the password hash the token was issued against. */
  pwv: string;
}

/** Access token: `id`, `email` and the configured `tokenClaims` columns of `user`. */
export function signAccessToken(
  user: Model,
  tokenClaims: readonly string[],
  jwtSecret: string,
  expiresIn: string
): string {
  const claims = Object.fromEntries(tokenClaims.map((claim) => [claim, user.get(claim)]));
  const payload = {
    ...claims,
    id: user.get(USER_ID_FIELD),
    email: user.get(USER_EMAIL_FIELD),
  };
  return jwt.sign(payload, jwtSecret, { expiresIn } as jwt.SignOptions);
}

/**
 * Changes whenever the password hash changes, so a reset token stops working once it has been used
 * — or once the password changed any other way — without storing anything.
 */
function passwordVersion(user: Model): string {
  return crypto
    .createHash('sha256')
    .update(String(user.get(USER_PASSWORD_FIELD)))
    .digest('hex')
    .slice(0, PASSWORD_VERSION_LENGTH);
}

export function signPasswordResetToken(user: Model, jwtSecret: string, expiresIn: string): string {
  const claims: PasswordResetClaims = {
    sub: String(user.get(USER_ID_FIELD)),
    purpose: PASSWORD_RESET_PURPOSE,
    pwv: passwordVersion(user),
  };
  return jwt.sign(claims, jwtSecret, { expiresIn } as jwt.SignOptions);
}

function invalidResetToken(): HttpError {
  return new HttpError(400, 'Invalid or expired reset token');
}

/** The user id of a valid, unexpired password-reset token; throws 400 otherwise. */
export function readPasswordResetToken(token: string, jwtSecret: string): PasswordResetClaims {
  let claims: PasswordResetClaims;
  try {
    claims = jwt.verify(token, jwtSecret) as PasswordResetClaims;
  } catch {
    throw invalidResetToken();
  }
  if (claims.purpose !== PASSWORD_RESET_PURPOSE || !claims.sub || !claims.pwv) {
    throw invalidResetToken();
  }
  return claims;
}

/** Throws 400 when the password changed since the token was issued (including by this token). */
export function assertResetTokenStillValid(claims: PasswordResetClaims, user: Model): void {
  if (claims.pwv !== passwordVersion(user)) throw invalidResetToken();
}
