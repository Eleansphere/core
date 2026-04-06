import { Request, Response, NextFunction } from 'express';

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = HTTP_STATUS_NAMES[statusCode] ?? 'Error';
  }
}

interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

export function defaultErrorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.status ?? err.statusCode ?? 500;
  const error =
    statusCode >= 500 ? 'Internal Server Error' : err.name !== 'Error' ? err.name : 'Error';
  const message = statusCode >= 500 ? 'An unexpected error occurred' : err.message;

  if (statusCode >= 500) {
    console.error('[be-core] Unhandled error', err);
  }

  res.status(statusCode).json({ error, message, statusCode });
}
