import { ApiError } from './api-error';

/**
 * The one place that knows how to talk to the backend: auth headers, JSON vs. multipart bodies,
 * and turning a non-2xx response into an `ApiError`. `ApiClient` (JSON CRUD verbs) and
 * `FilesClient` (the detached file service) both extend this instead of duplicating it.
 *
 * Not meant to be used directly — its methods are `protected`. Extend it to add a new kind of
 * client; `ApiClient`/`FilesClient` are the examples to follow.
 */
export class HttpTransport {
  // `public`, not `protected`: a `defineEntity` `extend` body (via `ExtendableService`) and
  // `withImages` both need to read these to build their own `FilesClient`.
  readonly baseUrl: string;
  readonly tokenProvider: () => string | null;

  constructor(baseUrl: string, tokenProvider: () => string | null) {
    this.baseUrl = baseUrl;
    this.tokenProvider = tokenProvider;
  }

  private authHeaders(): Record<string, string> {
    const token = this.tokenProvider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', ...this.authHeaders() };
  }

  /** Throws `ApiError` if `res` is not ok; a non-JSON error body falls back to `res.statusText`. */
  private async assertOk(res: Response): Promise<void> {
    if (res.ok) return;
    const body = await res.json().catch(() => undefined);
    const message = (body as { error?: string } | undefined)?.error ?? res.statusText;
    throw new ApiError(res.status, message, body);
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

  protected async getJson<T, P extends object = Record<string, never>>(
    path: string,
    params?: P
  ): Promise<T> {
    const res = await fetch(this.buildUrl(path, params), { headers: this.jsonHeaders() });
    await this.assertOk(res);
    return res.json();
  }

  protected async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify(body),
    });
    await this.assertOk(res);
    return res.json();
  }

  protected async putJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PUT',
      headers: this.jsonHeaders(),
      body: JSON.stringify(body),
    });
    await this.assertOk(res);
    return res.json();
  }

  protected async deleteRequest(path: string): Promise<void> {
    const res = await fetch(this.buildUrl(path), { method: 'DELETE', headers: this.jsonHeaders() });
    await this.assertOk(res);
  }

  /** POSTs a multipart form (a `File`/`Blob` plus scalar fields) and parses the JSON response. */
  protected async postMultipart<T, F extends object>(path: string, fields: F): Promise<T> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      formData.append(key, value instanceof Blob ? value : String(value));
    }

    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    });
    await this.assertOk(res);
    return res.json();
  }
}
