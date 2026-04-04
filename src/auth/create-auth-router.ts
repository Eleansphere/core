import { Router, Request, Response } from 'express';
import { ModelStatic, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createExtractUser } from './create-verify-token';

export interface AuthConfig {
  jwtSecret: string;
  expiresIn?: string;
}

export function createAuthRouter(UserModel: ModelStatic<any>, config: AuthConfig): Router {
  const { jwtSecret, expiresIn = '30m' } = config;
  const router = Router();
  const extractUser = createExtractUser(jwtSecret);

  router.post('/login', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email a heslo jsou povinná' });
      }

      const user = await UserModel.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({ error: 'Neplatný email nebo heslo' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Neplatný email nebo heslo' });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn } as any);
      return res.json({ token, email: user.email, role: user.role });
    } catch (error) {
      console.error('Chyba při přihlášení:', error);
      return res.status(500).json({ error: 'Interní chyba serveru' });
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
