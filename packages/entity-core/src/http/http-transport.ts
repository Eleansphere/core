import { ApiError } from './api-error';
import { AuthSession } from './auth-session';

/** Where requests get their bearer token: a function, or an `AuthSession` that also renews it. */
export type AccessTokenSource = (() => string | null) | AuthSession;

type JsonBodyMethod = 'POST' | 'PUT' | 'PATCH';
type AuthHeaders = Record<string, string>;

const UNAUTHORIZED = 401;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function authHeadersFor(token: string | null): AuthHeaders {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toFormData(fields: object): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    formData.append(key, value instanceof Blob ? value : String(value));
  }
  return formData;
}

/**
 * The one place that knows how to talk to the backend: auth headers, token renewal, JSON vs.
 * multipart bodies, and turning a non-2xx response into an `ApiError`. `ApiClient` (JSON verbs)
 * and `FilesClient` (the detached file service) both extend this instead of duplicating it.
 *
 * Not meant to be used directly — its methods are `protected`. Extend it to add a new kind of
 * client; `ApiClient`/`FilesClient` are the examples to follow.
 */
export class HttpTransport {
  // `public`, not `protected`: a `defineEntity` `extend` body (via `ExtendableService`) and
  // `withFiles` both need these to build their own `FilesClient`.
  readonly baseUrl: string;
  readonly tokenSource: AccessTokenSource;

  constructor(baseUrl: string, tokenSource: AccessTokenSource) {
    this.baseUrl = baseUrl;
    this.tokenSource = tokenSource;
  }

  private currentToken(): string | null {
    return typeof this.tokenSource === 'function'
      ? this.tokenSource()
      : this.tokenSource.accessToken;
  }

  /**
   * Sends a request built for the current token. When the answer is 401 and the token came from
   * an `AuthSession`, the session renews it once and the request is rebuilt and sent again.
   */
  private async send(url: string, buildRequest: (auth: AuthHeaders) => RequestInit) {
    const token = this.currentToken();
    const response = await fetch(url, buildRequest(authHeadersFor(token)));
    if (
      response.status !== UNAUTHORIZED ||
      token === null ||
      !(this.tokenSource instanceof AuthSession)
    ) {
      return response;
    }
    const renewed = await this.tokenSource.refresh(token);
    return renewed ? fetch(url, buildRequest(authHeadersFor(this.currentToken()))) : response;
  }

  /** Throws `ApiError` if `res` is not ok; a non-JSON error body falls back to `res.statusText`. */
  private async assertOk(res: Response): Promise<void> {
    if (res.ok) return;
    const body = await res.json().catch(() => undefined);
    const message = (body as { error?: string } | undefined)?.error ?? res.statusText;
    throw new ApiError(res.status, message, body);
  }

  /** The parsed JSON body, or `undefined` for an empty one (e.g. `204 No Content`). */
  private async readJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private buildUrl(path: string, params?: object): string {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const query = Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
      if (query) url += `?${query}`;
    }
    return url;
  }

  private async sendJson<T>(method: JsonBodyMethod, path: string, body: unknown): Promise<T> {
    const res = await this.send(this.buildUrl(path), (auth) => ({
      method,
      headers: { ...JSON_HEADERS, ...auth },
      body: JSON.stringify(body),
    }));
    await this.assertOk(res);
    return this.readJson<T>(res);
  }

  protected async getJson<T, P extends object = Record<string, never>>(
    path: string,
    params?: P
  ): Promise<T> {
    const res = await this.send(this.buildUrl(path, params), (auth) => ({
      headers: { ...JSON_HEADERS, ...auth },
    }));
    await this.assertOk(res);
    return this.readJson<T>(res);
  }

  protected postJson<T>(path: string, body: unknown): Promise<T> {
    return this.sendJson<T>('POST', path, body);
  }

  protected putJson<T>(path: string, body: unknown): Promise<T> {
    return this.sendJson<T>('PUT', path, body);
  }

  protected patchJson<T>(path: string, body: unknown): Promise<T> {
    return this.sendJson<T>('PATCH', path, body);
  }

  /** `DELETE`, optionally with a JSON body (e.g. a password confirmation). */
  protected async deleteRequest(path: string, body?: unknown): Promise<void> {
    const res = await this.send(this.buildUrl(path), (auth) => ({
      method: 'DELETE',
      headers: { ...JSON_HEADERS, ...auth },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }));
    await this.assertOk(res);
  }

  /** POSTs a multipart form (a `File`/`Blob` plus scalar fields) and parses the JSON response. */
  protected async postMultipart<T, F extends object>(path: string, fields: F): Promise<T> {
    const res = await this.send(this.buildUrl(path), (auth) => ({
      method: 'POST',
      headers: auth,
      body: toFormData(fields),
    }));
    await this.assertOk(res);
    return this.readJson<T>(res);
  }
}
