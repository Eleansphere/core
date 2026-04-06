import { Router, Request, Response, NextFunction } from 'express';
import { ModelStatic } from 'sequelize';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app/error-handler';
import { createExtractUser } from './create-verify-token';

export interface AuthConfig {
  jwtSecret: string;
  expiresIn?: string;
}

export function createAuthRouter(UserModel: ModelStatic<any>, config: AuthConfig): Router {
  const { jwtSecret, expiresIn = '30m' } = config;
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

  return router;
}
