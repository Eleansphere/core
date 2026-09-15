import { Request, Response, NextFunction } from 'express';
import type { ValidationIssue } from '@eleansphere/schema';

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

const INTERNAL_SERVER_ERROR = 500;
const UNIQUE_CONSTRAINT_ERROR = 'SequelizeUniqueConstraintError';

// Sequelize errors that map to a specific HTTP status instead of a generic 500
const SEQUELIZE_ERROR_STATUS: Record<string, number> = {
  [UNIQUE_CONSTRAINT_ERROR]: 409,
  SequelizeValidationError: 400,
  SequelizeForeignKeyConstraintError: 409,
};

export class HttpError extends Error {
  statusCode: number;
  /** Field-level problems, sent to the client as `issues` next to the message. */
  issues?: ValidationIssue[];

  constructor(statusCode: number, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.statusCode = statusCode;
    this.issues = issues;
    this.name = HTTP_STATUS_NAMES[statusCode] ?? 'Error';
  }
}

/** 400 carrying the field problems `validateFields` found. */
export class ValidationError extends HttpError {
  constructor(issues: ValidationIssue[]) {
    super(400, 'Validation failed', issues);
  }
}

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  issues?: ValidationIssue[];
  errors?: { message: string; path?: string | null }[];
}

/** A unique-constraint violation, reported per column so a form can mark the field. */
function uniqueConstraintIssues(err: AppError): ValidationIssue[] | undefined {
  if (err.name !== UNIQUE_CONSTRAINT_ERROR) return undefined;
  return (err.errors ?? [])
    .filter((error): error is { message: string; path: string } => !!error.path)
    .map((error) => ({ path: error.path, code: 'unique' }));
}

export function defaultErrorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const sequelizeStatus = SEQUELIZE_ERROR_STATUS[err.name];
  const statusCode = err.status ?? err.statusCode ?? sequelizeStatus ?? INTERNAL_SERVER_ERROR;

  if (statusCode >= INTERNAL_SERVER_ERROR) {
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
  const issues = err.issues ?? uniqueConstraintIssues(err);

  res
    .status(statusCode)
    .json({ error, message, statusCode, ...(issues && issues.length > 0 ? { issues } : {}) });
}
