import type { ValidationIssue } from '@eleansphere/schema';

type ErrorBody = { message?: unknown; issues?: unknown } | undefined;

/**
 * Thrown by `HttpTransport` (and anything built on it — `ApiClient`, `FilesClient`) for any
 * non-2xx response. Carries the real HTTP status and the parsed error body, instead of a bare
 * `Error` with a message string — so callers can branch on `status`/`isAuthError`/`isNotFound`
 * instead of matching on message text (fragile, and breaks if the backend's wording changes).
 */
export class ApiError extends Error {
  readonly status: number;
  /** The parsed JSON error body, if the response had one and it parsed as JSON. */
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** 401 or 403 — the caller likely needs to re-authenticate. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** The server's explanation (`message` in be-core's error body), when it sent one. */
  get detail(): string | undefined {
    const message = (this.body as ErrorBody)?.message;
    return typeof message === 'string' ? message : undefined;
  }

  /** Field problems of a validation error (be-core's `issues`); empty for any other error. */
  get issues(): ValidationIssue[] {
    const issues = (this.body as ErrorBody)?.issues;
    return Array.isArray(issues) ? (issues as ValidationIssue[]) : [];
  }
}
