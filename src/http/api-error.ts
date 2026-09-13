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
}
