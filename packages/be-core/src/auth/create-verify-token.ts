import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app/error-handler';
import { AuthenticatedUser } from '../types/express-request';

export function createVerifyToken(jwtSecret: string): RequestHandler {
  return function verifyToken(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return next(new HttpError(401, 'Authorization token is missing'));
    }

    const token = authHeader.split(' ')[1];

    try {
      req.user = jwt.verify(token, jwtSecret) as AuthenticatedUser;
      next();
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
    }
  };
}

// The README has long described this as "alias for createVerifyToken" — it now actually is one.
// Both names stay: `createVerifyToken` reads as "gate this route", `createExtractUser` as "make
// req.user available", even though they do the same thing.
export const createExtractUser = createVerifyToken;
