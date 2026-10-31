import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Model } from 'sequelize';
import { HttpError } from '../app/error-handler';

const PASSWORD_RESET_PURPOSE = 'password-reset';
const EMAIL_VERIFICATION_PURPOSE = 'email-verification';
const PASSWORD_VERSION_LENGTH = 16;

/** The `typ` claim of an access token. Tokens issued for anything else never pass as one. */
export const ACCESS_TOKEN_TYPE = 'access';

export const USER_ID_FIELD = 'id';
export const USER_EMAIL_FIELD = 'email';
export const USER_PASSWORD_FIELD = 'password';

interface PasswordResetClaims {
  sub: string;
  purpose: string;
  /** Fingerprint of the password hash the token was issued against. */
  pwv: string;
}

/** Access token: `id`, `email`, `typ: 'access'` and the configured `tokenClaims` of `user`. */
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
    typ: ACCESS_TOKEN_TYPE,
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

interface EmailVerificationClaims {
  sub: string;
  purpose: string;
  /** The address the link was sent to: a token for an earlier address verifies nothing. */
  email: string;
}

export function signEmailVerificationToken(
  user: Model,
  jwtSecret: string,
  expiresIn: string
): string {
  const claims: EmailVerificationClaims = {
    sub: String(user.get(USER_ID_FIELD)),
    purpose: EMAIL_VERIFICATION_PURPOSE,
    email: String(user.get(USER_EMAIL_FIELD)),
  };
  return jwt.sign(claims, jwtSecret, { expiresIn } as jwt.SignOptions);
}

function invalidVerificationToken(): HttpError {
  return new HttpError(400, 'Invalid or expired verification link');
}

/** The claims of a valid, unexpired e-mail verification token; throws 400 otherwise. */
export function readEmailVerificationToken(
  token: string,
  jwtSecret: string
): EmailVerificationClaims {
  let claims: EmailVerificationClaims;
  try {
    claims = jwt.verify(token, jwtSecret) as EmailVerificationClaims;
  } catch {
    throw invalidVerificationToken();
  }
  if (claims.purpose !== EMAIL_VERIFICATION_PURPOSE || !claims.sub || !claims.email) {
    throw invalidVerificationToken();
  }
  return claims;
}

/** Throws 400 when the account's address is no longer the one the link was sent to. */
export function assertVerificationTokenMatches(claims: EmailVerificationClaims, user: Model): void {
  if (claims.email !== user.get(USER_EMAIL_FIELD)) throw invalidVerificationToken();
}
