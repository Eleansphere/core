import { Router, Request, Response, NextFunction } from 'express';
import { Model, ModelStatic } from 'sequelize';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app/error-handler';
import { createExtractUser } from './create-verify-token';
import { EmailService, EmailTemplateFunction } from '../email/email-types';
import { generateId } from '../utils/generate-id';
import { hashPassword, comparePassword } from '../utils/hash-password';

export interface PasswordResetConfig {
  appBaseUrl: string;
  resetPath?: string;
  tokenExpiresIn?: string;
  template?: EmailTemplateFunction<{ resetLink: string }>;
}

export interface RegisterConfig {
  /** ID prefix for the new user record (be-core's own `generateId`). */
  idPrefix: string;
  /** Body fields (beyond email/password) that must be present, or a 400 is thrown. */
  requiredFields?: string[];
  /** Body fields (beyond email/password) copied verbatim onto the new user record. */
  extraFields?: string[];
  /** Static fields set on every newly registered user, e.g. `{ role: 'user' }`. */
  defaults?: Record<string, unknown>;
}

export interface AuthConfig {
  jwtSecret: string;
  expiresIn?: string;
  /**
   * User columns copied into the JWT next to `id` and `email`, so they're available as
   * `req.user.<claim>` without a database lookup. Role-based access policies need `'role'`.
   */
  tokenClaims?: string[];
  emailService?: EmailService;
  passwordReset?: PasswordResetConfig;
  /** Mounts `POST /register` — self-service sign-up. Omit to leave registration to the project. */
  register?: RegisterConfig;
  /**
   * Mounts `POST /change-password` (JWT-protected) — the signed-in user submits their current
   * password to set a new one. Distinct from `passwordReset`, which is the unauthenticated
   * forgot-password-by-email flow.
   */
  changePassword?: boolean;
}

const DEFAULT_TOKEN_LIFETIME = '30m';

function buildTokenPayload(user: Model, tokenClaims: readonly string[]): Record<string, unknown> {
  const claims = Object.fromEntries(tokenClaims.map((claim) => [claim, user.get(claim)]));
  return { ...claims, id: user.get('id'), email: user.get('email') };
}

export function createAuthRouter(UserModel: ModelStatic<any>, config: AuthConfig): Router {
  const {
    jwtSecret,
    expiresIn = DEFAULT_TOKEN_LIFETIME,
    tokenClaims = [],
    emailService,
    passwordReset,
    register,
    changePassword,
  } = config;
  const router = Router();
  const extractUser = createExtractUser(jwtSecret);

  router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        throw new HttpError(400, 'Email and password are required');
      }

      const user = await UserModel.findOne({ where: { email } });
      if (!user) {
        throw new HttpError(401, 'Invalid email or password');
      }

      const isMatch = await comparePassword(password, user.get('password') as string);
      if (!isMatch) {
        throw new HttpError(401, 'Invalid email or password');
      }

      const token = jwt.sign(buildTokenPayload(user, tokenClaims), jwtSecret, {
        expiresIn,
      } as jwt.SignOptions);
      res.json({ token, id: user.get('id'), email: user.get('email'), role: user.get('role') });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', extractUser, (req: Request, res: Response) => {
    // Set by `extractUser` (createVerifyToken) — never undefined once that middleware ran.
    const user = req.user!;
    res.json({
      id: user.id,
      email: user.email,
    });
  });

  if (passwordReset) {
    const {
      appBaseUrl,
      resetPath = '/reset-password',
      tokenExpiresIn = '1h',
      template,
    } = passwordReset;

    router.post(
      '/forgot-password',
      async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
          const { email } = req.body;
          if (!email) {
            throw new HttpError(400, 'Email is required');
          }

          const user = await UserModel.findOne({ where: { email } });
          // Always respond 200 to prevent email enumeration
          if (!user || !emailService || !template) {
            res.json({ message: 'If the email exists, a reset link has been sent' });
            return;
          }

          const resetToken = jwt.sign(
            { userId: user.get('id'), purpose: 'password-reset' },
            jwtSecret,
            { expiresIn: tokenExpiresIn } as jwt.SignOptions
          );
          const resetLink = `${appBaseUrl}${resetPath}?token=${resetToken}`;

          emailService
            .send({ to: email, ...template({ resetLink }) })
            .catch((err: unknown) => console.error('Failed to send password reset email:', err));

          res.json({ message: 'If the email exists, a reset link has been sent' });
        } catch (err) {
          next(err);
        }
      }
    );

    router.post(
      '/reset-password',
      async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
          const { token, newPassword } = req.body;
          if (!token || !newPassword) {
            throw new HttpError(400, 'Token and new password are required');
          }

          let payload: { userId: string; purpose: string };
          try {
            payload = jwt.verify(token, jwtSecret) as { userId: string; purpose: string };
          } catch {
            throw new HttpError(400, 'Invalid or expired reset token');
          }

          if (payload.purpose !== 'password-reset') {
            throw new HttpError(400, 'Invalid reset token');
          }

          const user = await UserModel.findByPk(payload.userId);
          if (!user) {
            throw new HttpError(404, 'User not found');
          }

          const hashed = await hashPassword(newPassword);
          await user.update({ password: hashed });

          res.json({ message: 'Password reset successful' });
        } catch (err) {
          next(err);
        }
      }
    );
  }

  if (register) {
    const { idPrefix, requiredFields = [], extraFields = [], defaults = {} } = register;

    router.post(
      '/register',
      async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
          const { email, password, ...rest } = req.body ?? {};
          const missingRequired = requiredFields.some((field) => !rest[field]);
          if (!email || !password || missingRequired) {
            throw new HttpError(400, 'All fields are required');
          }

          const existing = await UserModel.findOne({ where: { email } });
          if (existing) {
            throw new HttpError(409, 'A user with this email already exists');
          }

          const extra = Object.fromEntries(extraFields.map((field) => [field, rest[field]]));
          await UserModel.create({
            id: generateId(idPrefix),
            email,
            password: await hashPassword(password),
            ...extra,
            ...defaults,
          });

          res.status(201).json({ message: 'Registration successful' });
        } catch (err) {
          next(err);
        }
      }
    );
  }

  if (changePassword) {
    router.post(
      '/change-password',
      extractUser,
      async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
          const { currentPassword, newPassword } = req.body ?? {};
          if (!currentPassword || !newPassword) {
            throw new HttpError(400, 'Current password and new password are required');
          }

          const user = await UserModel.findByPk(req.user!.id);
          if (!user) {
            throw new HttpError(404, 'User not found');
          }

          const isMatch = await comparePassword(currentPassword, user.get('password') as string);
          if (!isMatch) {
            throw new HttpError(401, 'Incorrect current password');
          }

          await user.update({ password: await hashPassword(newPassword) });
          res.json({ message: 'Password changed successfully' });
        } catch (err) {
          next(err);
        }
      }
    );
  }

  return router;
}
