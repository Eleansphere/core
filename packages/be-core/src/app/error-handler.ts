import { Request, Response, NextFunction } from 'express';

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

// Sequelize errors that map to a specific HTTP status instead of a generic 500
const SEQUELIZE_ERROR_STATUS: Record<string, number> = {
  SequelizeUniqueConstraintError: 409,
  SequelizeValidationError: 400,
  SequelizeForeignKeyConstraintError: 409,
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
  errors?: { message: string }[];
}

export function defaultErrorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const sequelizeStatus = SEQUELIZE_ERROR_STATUS[err.name];
  const statusCode = err.status ?? err.statusCode ?? sequelizeStatus ?? 500;

  if (statusCode >= 500) {
    console.error('[be-core] Unhandled error', err);
    res.status(statusCode).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode,
    });
    return;
  }

  const error = sequelizeStatus
    ? HTTP_STATUS_NAMES[statusCode]
    : err.name !== 'Error'
      ? err.name
      : 'Error';
  const message =
    sequelizeStatus && err.errors?.length
      ? err.errors.map((e) => e.message).join(', ')
      : err.message;

  res.status(statusCode).json({ error, message, statusCode });
}
