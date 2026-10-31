import { Router, Request, Response, RequestHandler } from 'express';
import { Model, ModelStatic, Op } from 'sequelize';
import { validateFields } from '@eleansphere/schema';
import type { FieldConfig, ValidationMode } from '@eleansphere/schema';
import { HttpError, ValidationError } from '../app/error-handler';
import { createVerifyToken } from './create-verify-token';
import { EmailService, EmailTemplateFunction } from '../email/email-types';
import { generateId } from '../utils/generate-id';
import { hashPassword, comparePassword } from '../utils/hash-password';
import {
  createRateLimiter,
  DEFAULT_ACCOUNT_RATE_LIMIT,
  DEFAULT_AUTH_RATE_LIMIT,
  RateLimitConfig,
  routeKey,
} from './rate-limiter';
import type { RefreshTokenStore } from './refresh-tokens';
import {
  assertResetTokenStillValid,
  assertVerificationTokenMatches,
  readEmailVerificationToken,
  readPasswordResetToken,
  signAccessToken,
  signEmailVerificationToken,
  signPasswordResetToken,
  USER_EMAIL_FIELD,
  USER_ID_FIELD,
  USER_PASSWORD_FIELD,
} from './tokens';

export interface PasswordResetConfig {
  /** Frontend origin the link points to, e.g. `https://app.example.com`. */
  appBaseUrl: string;
  /** Frontend route receiving `?token=`. Default `/reset-password`. */
  resetPath?: string;
  /** Default `1h`. */
  tokenExpiresIn?: string;
  /** `user` is the account as JSON (sensitive fields stripped), e.g. for its language. */
  template: EmailTemplateFunction<{ resetLink: string; user: Record<string, unknown> }>;
}

export interface EmailVerificationConfig {
  /** Frontend origin the link points to, e.g. `https://app.example.com`. */
  appBaseUrl: string;
  /** Frontend route receiving `?token=`. Default `/verify-email`. */
  verifyPath?: string;
  /** Default `7d`. */
  tokenExpiresIn?: string;
  /** User column set to the time the address was verified. Default `emailVerifiedAt`. */
  field?: string;
  /** `user` is the account as JSON (sensitive fields stripped), e.g. for its language. */
  template: EmailTemplateFunction<{ verifyLink: string; user: Record<string, unknown> }>;
}

export interface RegisterConfig {
  /** ID prefix for new users, e.g. `'u_'`. */
  idPrefix: string;
  /** User columns a registration may set besides `email` and `password`, e.g. `['displayName']`. */
  fields?: string[];
  /** Columns set on every new user, e.g. `{ role: 'user' }`. Values sent for `fields` win. */
  defaults?: Record<string, unknown>;
}

export interface AuthConfig {
  jwtSecret: string;
  /** Access token lifetime. Default `30m`; keep it short when refresh tokens are enabled. */
  expiresIn?: string;
  /** User columns copied into the access token next to `id` and `email`, e.g. `['role']`. */
  tokenClaims?: string[];
  /** The user model's field rules: validate registration, profile changes and new passwords. */
  userFields?: Record<string, FieldConfig>;
  /** Enables `POST /refresh` and `POST /logout`, and adds a `refreshToken` to every session. */
  refreshTokens?: RefreshTokenStore;
  emailService?: EmailService;
  /** Mounts `POST /forgot-password` and `POST /reset-password`; needs `emailService`. */
  passwordReset?: PasswordResetConfig;
  /**
   * Sends every new account a link that confirms its address, and mounts `POST /verify-email`
   * (`{ token }`) and `POST /verification-email` (sends the signed-in user a new link). Needs
   * `emailService`.
   */
  emailVerification?: EmailVerificationConfig;
  /** Mounts `POST /register`. */
  register?: RegisterConfig;
  /** Mounts `POST /change-password`. */
  changePassword?: boolean;
  /** Mounts `PATCH /me`, accepting exactly these user columns. */
  profileFields?: string[];
  /** Mounts `DELETE /me` (password confirmation required). */
  deleteAccount?: boolean;
  /** Runs before an account is deleted, e.g. to delete its files. */
  beforeDeleteAccount?: (user: Model) => Promise<void>;
  /** Limits login, registration, password and account-deletion attempts per client. */
  rateLimit?: RateLimitConfig | 'off';
  /**
   * Limits failed logins per account (by e-mail, from any client) and reset e-mails per address.
   * Default {@link DEFAULT_ACCOUNT_RATE_LIMIT}; `'off'` when `rateLimit` is.
   */
  accountRateLimit?: RateLimitConfig | 'off';
  /** bcrypt cost for new password hashes. Default 12. */
  passwordHashRounds?: number;
}

export interface SessionResponse {
  token: string;
  refreshToken?: string;
  id: unknown;
  email: unknown;
  role: unknown;
  /** The user row as JSON (sensitive fields stripped). */
  user: unknown;
}

const DEFAULT_ACCESS_TOKEN_LIFETIME = '30m';
const DEFAULT_RESET_PATH = '/reset-password';
const DEFAULT_RESET_TOKEN_LIFETIME = '1h';
const DEFAULT_VERIFY_PATH = '/verify-email';
const DEFAULT_VERIFICATION_TOKEN_LIFETIME = '7d';
const DEFAULT_VERIFIED_AT_FIELD = 'emailVerifiedAt';
/** New verification links per account per hour. */
const VERIFICATION_EMAIL_RATE_LIMIT: RateLimitConfig = { windowMs: 60 * 60 * 1000, max: 5 };
/** bcrypt reads only the first 72 bytes of a password: anything longer would be cut silently. */
export const PASSWORD_MAX_BYTES = 72;
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;
const ROLE_FIELD = 'role';
const CREDENTIAL_FIELDS = [USER_EMAIL_FIELD, USER_PASSWORD_FIELD];
const RESET_LINK_SENT_MESSAGE = 'If the email exists, a reset link has been sent';

function route(body: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try {
      await body(req, res);
    } catch (err) {
      next(err);
    }
  };
}

/** The listed keys the body actually contains — nothing else ever reaches the model. */
function pickPresent(body: unknown, keys: readonly string[]): Record<string, unknown> {
  const source = (body ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .map((key) => [key, source[key]])
  );
}

/** Non-empty string body values, or a 400 with a `required` issue per missing one. */
function requireStrings(body: unknown, keys: readonly string[]): Record<string, string> {
  const source = (body ?? {}) as Record<string, unknown>;
  const missing = keys.filter((key) => typeof source[key] !== 'string' || source[key] === '');
  if (missing.length > 0) {
    throw new ValidationError(missing.map((key) => ({ path: key, code: 'required' as const })));
  }
  return source as Record<string, string>;
}

function invalidCredentials(): HttpError {
  return new HttpError(401, 'Invalid email or password');
}

/** E-mail addresses are compared and stored trimmed and in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizedEmailOf(body: unknown): string {
  const email = (body as Record<string, unknown> | undefined)?.[USER_EMAIL_FIELD];
  return typeof email === 'string' ? normalizeEmail(email) : '';
}

/** Matches the address whatever its letter case, including accounts stored before lower case. */
function emailWhere(email: string) {
  const pattern = normalizeEmail(email).replace(LIKE_SPECIAL_CHARACTERS, '\\$&');
  return { [USER_EMAIL_FIELD]: { [Op.iLike]: pattern } };
}

function assertPasswordFitsHash(password: string, path: string): void {
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new ValidationError([
      { path, code: 'maxLength', params: { maxLength: PASSWORD_MAX_BYTES } },
    ]);
  }
}

export function createAuthRouter(UserModel: ModelStatic<any>, config: AuthConfig): Router {
  const {
    jwtSecret,
    expiresIn = DEFAULT_ACCESS_TOKEN_LIFETIME,
    tokenClaims = [],
    userFields = {},
    refreshTokens,
    emailService,
    passwordReset,
    register,
    changePassword,
    profileFields = [],
    deleteAccount,
    beforeDeleteAccount,
    rateLimit = DEFAULT_AUTH_RATE_LIMIT,
    accountRateLimit = DEFAULT_ACCOUNT_RATE_LIMIT,
    emailVerification,
    passwordHashRounds,
  } = config;
  if (passwordReset && !emailService) {
    throw new Error('auth.passwordReset needs an email service: set AppConfig.email');
  }
  if (emailVerification && !emailService) {
    throw new Error('auth.emailVerification needs an email service: set AppConfig.email');
  }

  const router = Router();
  const requireUser = createVerifyToken(jwtSecret);
  const limitsOff = rateLimit === 'off';
  const limitAttempts: RequestHandler[] = limitsOff ? [] : [createRateLimiter(rateLimit)];
  const accountLimitsOff = limitsOff || accountRateLimit === 'off';
  /** Per account, from any client: by the e-mail in the body, per route. */
  function limitPerAccount(options: { failuresOnly: boolean }): RequestHandler[] {
    if (accountLimitsOff) return [];
    return [
      createRateLimiter({
        ...accountRateLimit,
        keyOf: (req) => `account:${routeKey(req)}:${normalizedEmailOf(req.body)}`,
        skipSuccessfulRequests: options.failuresOnly,
      }),
    ];
  }
  const hash = (password: string) => hashPassword(password, passwordHashRounds);
  /**
   * Compared against when the e-mail is unknown, so a login takes as long whether the account
   * exists or not. Made on first use: hashing at a real cost takes a moment.
   */
  let dummyHash: Promise<string> | undefined;
  const dummyPasswordHash = () => (dummyHash ??= hash('no account has this password'));

  function assertValid(data: Record<string, unknown>, fieldNames: string[], mode: ValidationMode) {
    const rules = Object.fromEntries(
      fieldNames.filter((name) => userFields[name]).map((name) => [name, userFields[name]])
    );
    const issues = validateFields(rules, data, { mode });
    if (issues.length > 0) throw new ValidationError(issues);
  }

  /** Validates a new password against the `password` field rules, reported under `clientField`. */
  function assertValidNewPassword(newPassword: string, clientField: string) {
    assertPasswordFitsHash(newPassword, clientField);
    try {
      assertValid({ [USER_PASSWORD_FIELD]: newPassword }, [USER_PASSWORD_FIELD], 'create');
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      throw new ValidationError(
        (err.issues ?? []).map((issue) => ({ ...issue, path: clientField }))
      );
    }
  }

  async function findUserOrThrow(id: string): Promise<Model> {
    const user = await UserModel.findByPk(id);
    if (!user) throw new HttpError(404, 'User not found');
    return user;
  }

  async function passwordMatches(user: Model, password: string): Promise<boolean> {
    return comparePassword(password, String(user.get(USER_PASSWORD_FIELD)));
  }

  function findUserByEmail(email: string): Promise<Model | null> {
    return UserModel.findOne({ where: emailWhere(email) });
  }

  async function assertPasswordMatches(user: Model, password: string): Promise<void> {
    if (!(await passwordMatches(user, password))) throw new HttpError(401, 'Incorrect password');
  }

  async function startSession(user: Model): Promise<SessionResponse> {
    const userId = String(user.get(USER_ID_FIELD));
    return {
      token: signAccessToken(user, tokenClaims, jwtSecret, expiresIn),
      ...(refreshTokens ? { refreshToken: await refreshTokens.issue(userId) } : {}),
      id: user.get(USER_ID_FIELD),
      email: user.get(USER_EMAIL_FIELD),
      role: user.get(ROLE_FIELD),
      user: user.toJSON(),
    };
  }

  /** Sets a new password and logs every existing session out. */
  async function replacePassword(user: Model, newPassword: string): Promise<void> {
    await user.update({ [USER_PASSWORD_FIELD]: await hash(newPassword) });
    await refreshTokens?.revokeAllForUser(String(user.get(USER_ID_FIELD)));
  }

  /** Sends the user a link that confirms their address; a failure is only logged. */
  let sendVerificationEmail: ((user: Model) => void) | undefined;

  if (emailVerification && emailService) {
    const {
      appBaseUrl,
      verifyPath = DEFAULT_VERIFY_PATH,
      tokenExpiresIn = DEFAULT_VERIFICATION_TOKEN_LIFETIME,
      field = DEFAULT_VERIFIED_AT_FIELD,
      template,
    } = emailVerification;
    const mailer = emailService;

    sendVerificationEmail = (user) => {
      const token = signEmailVerificationToken(user, jwtSecret, tokenExpiresIn);
      const verifyLink = `${appBaseUrl}${verifyPath}?token=${encodeURIComponent(token)}`;
      mailer
        .send({
          to: String(user.get(USER_EMAIL_FIELD)),
          ...template({ verifyLink, user: user.toJSON() as Record<string, unknown> }),
        })
        .catch(() => undefined);
    };
    const send = sendVerificationEmail;

    router.post(
      '/verify-email',
      ...limitAttempts,
      route(async (req, res) => {
        const { token } = requireStrings(req.body, ['token']);
        const claims = readEmailVerificationToken(token, jwtSecret);
        const user = await UserModel.findByPk(claims.sub);
        if (!user) throw new HttpError(400, 'Invalid or expired verification link');
        assertVerificationTokenMatches(claims, user);
        if (!user.get(field)) await user.update({ [field]: new Date() });
        res.json(user.toJSON());
      })
    );

    const limitResends: RequestHandler[] = limitsOff
      ? []
      : [
          createRateLimiter({
            ...VERIFICATION_EMAIL_RATE_LIMIT,
            keyOf: (req) => `verification-email:${req.user?.id}`,
          }),
        ];
    router.post(
      '/verification-email',
      requireUser,
      ...limitResends,
      route(async (req, res) => {
        const user = await findUserOrThrow(req.user!.id);
        if (!user.get(field)) send(user);
        res.status(202).send();
      })
    );
  }

  router.post(
    '/login',
    ...limitAttempts,
    ...limitPerAccount({ failuresOnly: true }),
    route(async (req, res) => {
      const { email, password } = requireStrings(req.body, CREDENTIAL_FIELDS);
      const user = await findUserByEmail(email);
      if (!user) {
        await comparePassword(password, await dummyPasswordHash());
        throw invalidCredentials();
      }
      if (!(await passwordMatches(user, password))) throw invalidCredentials();
      res.json(await startSession(user));
    })
  );

  router.get(
    '/me',
    requireUser,
    route(async (req, res) => {
      res.json((await findUserOrThrow(req.user!.id)).toJSON());
    })
  );

  if (refreshTokens) {
    const store = refreshTokens;

    router.post(
      '/refresh',
      route(async (req, res) => {
        const { refreshToken } = requireStrings(req.body, ['refreshToken']);
        const rotated = await store.rotate(refreshToken);
        const user = await UserModel.findByPk(rotated.userId);
        if (!user) throw new HttpError(401, 'Invalid refresh token');
        res.json({
          token: signAccessToken(user, tokenClaims, jwtSecret, expiresIn),
          refreshToken: rotated.refreshToken,
        });
      })
    );

    router.post(
      '/logout',
      route(async (req, res) => {
        const { refreshToken } = requireStrings(req.body, ['refreshToken']);
        await store.revoke(refreshToken);
        res.status(204).send();
      })
    );
  }

  if (register) {
    const registrationFields = [...CREDENTIAL_FIELDS, ...(register.fields ?? [])];

    router.post(
      '/register',
      ...limitAttempts,
      route(async (req, res) => {
        const credentials = requireStrings(req.body, CREDENTIAL_FIELDS);
        const data = {
          ...pickPresent(req.body, registrationFields),
          [USER_EMAIL_FIELD]: normalizeEmail(credentials[USER_EMAIL_FIELD]),
        };
        assertValid(data, registrationFields, 'create');
        assertPasswordFitsHash(credentials[USER_PASSWORD_FIELD], USER_PASSWORD_FIELD);

        const existing = await findUserByEmail(credentials[USER_EMAIL_FIELD]);
        if (existing) {
          throw new HttpError(409, 'A user with this email already exists', [
            { path: USER_EMAIL_FIELD, code: 'unique' },
          ]);
        }

        const user = await UserModel.create({
          ...register.defaults,
          ...data,
          [USER_ID_FIELD]: generateId(register.idPrefix),
          [USER_PASSWORD_FIELD]: await hash(credentials[USER_PASSWORD_FIELD]),
        });
        sendVerificationEmail?.(user);
        res.status(201).json(await startSession(user));
      })
    );
  }

  if (changePassword) {
    router.post(
      '/change-password',
      ...limitAttempts,
      requireUser,
      route(async (req, res) => {
        const { currentPassword, newPassword } = requireStrings(req.body, [
          'currentPassword',
          'newPassword',
        ]);
        const user = await findUserOrThrow(req.user!.id);
        await assertPasswordMatches(user, currentPassword);
        assertValidNewPassword(newPassword, 'newPassword');
        await replacePassword(user, newPassword);
        res.json(await startSession(user));
      })
    );
  }

  if (profileFields.length > 0) {
    router.patch(
      '/me',
      requireUser,
      route(async (req, res) => {
        const changes = pickPresent(req.body, profileFields);
        assertValid(changes, profileFields, 'patch');
        const user = await findUserOrThrow(req.user!.id);
        await user.update(changes);
        res.json(user.toJSON());
      })
    );
  }

  if (deleteAccount) {
    router.delete(
      '/me',
      ...limitAttempts,
      requireUser,
      route(async (req, res) => {
        const { password } = requireStrings(req.body, [USER_PASSWORD_FIELD]);
        const user = await findUserOrThrow(req.user!.id);
        await assertPasswordMatches(user, password);
        await beforeDeleteAccount?.(user);
        await user.destroy();
        res.status(204).send();
      })
    );
  }

  if (passwordReset && emailService) {
    const {
      appBaseUrl,
      resetPath = DEFAULT_RESET_PATH,
      tokenExpiresIn = DEFAULT_RESET_TOKEN_LIFETIME,
      template,
    } = passwordReset;
    const mailer = emailService;

    router.post(
      '/forgot-password',
      ...limitAttempts,
      ...limitPerAccount({ failuresOnly: false }),
      route(async (req, res) => {
        const { email } = requireStrings(req.body, [USER_EMAIL_FIELD]);
        const user = await findUserByEmail(email);
        if (user) {
          const resetToken = signPasswordResetToken(user, jwtSecret, tokenExpiresIn);
          const resetLink = `${appBaseUrl}${resetPath}?token=${encodeURIComponent(resetToken)}`;
          // Not awaited: neither timing nor a delivery error may reveal whether the email exists.
          // The email service logs failures. Sent to the stored address, never to what was typed.
          mailer
            .send({
              to: String(user.get(USER_EMAIL_FIELD)),
              ...template({ resetLink, user: user.toJSON() as Record<string, unknown> }),
            })
            .catch(() => undefined);
        }
        res.json({ message: RESET_LINK_SENT_MESSAGE });
      })
    );

    router.post(
      '/reset-password',
      ...limitAttempts,
      route(async (req, res) => {
        const { token, newPassword } = requireStrings(req.body, ['token', 'newPassword']);
        const claims = readPasswordResetToken(token, jwtSecret);
        const user = await UserModel.findByPk(claims.sub);
        if (!user) throw new HttpError(400, 'Invalid or expired reset token');
        assertResetTokenStillValid(claims, user);
        assertValidNewPassword(newPassword, 'newPassword');
        await replacePassword(user, newPassword);
        res.json({ message: 'Password reset successful' });
      })
    );
  }

  return router;
}
