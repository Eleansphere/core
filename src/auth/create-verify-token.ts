import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app/error-handler';

export function createVerifyToken(jwtSecret: string): RequestHandler {
  return function verifyToken(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return next(new HttpError(401, 'Authorization token is missing'));
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
      (req as any).user = decoded;
      next();
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
    }
  };
}

export function createExtractUser(jwtSecret: string): RequestHandler {
  return function extractUser(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return next(new HttpError(401, 'Authorization token is missing'));
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
      (req as any).user = decoded;
      next();
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
    }
  };
}
