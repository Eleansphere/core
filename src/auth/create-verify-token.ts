import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export function createVerifyToken(jwtSecret: string): RequestHandler {
  return function verifyToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ message: 'Chybí autorizační token' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: 'Neplatný nebo vypršený token' });
    }
  };
}

export function createExtractUser(jwtSecret: string): RequestHandler {
  return function extractUser(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ message: 'Chybí autorizační token' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: 'Neplatný nebo vypršený token' });
    }
  };
}
