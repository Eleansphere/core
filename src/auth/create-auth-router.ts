import { Router, Request, Response, NextFunction } from 'express';
import { ModelStatic } from 'sequelize';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app/error-handler';
import { createExtractUser } from './create-verify-token';
import { EmailService, EmailTemplateFunction } from '../email/email-types';

export interface PasswordResetConfig {
  appBaseUrl: string;
  resetPath?: string;
  tokenExpiresIn?: string;
  template?: EmailTemplateFunction<{ resetLink: string }>;
}

export interface AuthConfig {
  jwtSecret: string;
  expiresIn?: string;
  emailService?: EmailService;
  passwordReset?: PasswordResetConfig;
}

const SALT_ROUNDS = 10;

export function createAuthRouter(UserModel: ModelStatic<any>, config: AuthConfig): Router {
  const { jwtSecret, expiresIn = '30m', emailService, passwordReset } = config;
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

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new HttpError(401, 'Invalid email or password');
      }

      const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn } as any);
      res.json({ token, email: user.email, role: user.role });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', extractUser, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({
      id: user.id,
      email: user.email,
    });
  });

  if (passwordReset) {
    const { appBaseUrl, resetPath = '/reset-password', tokenExpiresIn = '1h', template } = passwordReset;

    router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
          { expiresIn: tokenExpiresIn } as any
        );
        const resetLink = `${appBaseUrl}${resetPath}?token=${resetToken}`;

        emailService
          .send({ to: email, ...template({ resetLink }) })
          .catch((err: unknown) => console.error('Failed to send password reset email:', err));

        res.json({ message: 'If the email exists, a reset link has been sent' });
      } catch (err) {
        next(err);
      }
    });

    router.post('/reset-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

        const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await user.update({ password: hashed });

        res.json({ message: 'Password reset successful' });
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
