export class ApiClient {
  // `public` (not `protected`) so `extend` bodies can call them on `this` with real types via
  // entity-core's `ExtendableService` — the generated service's *public* type still only surfaces
  // CRUD, this just makes the helpers reachable inside a subclass definition.
  readonly baseUrl: string;
  protected tokenProvider: () => string | null;

  constructor(baseUrl: string, tokenProvider: () => string | null) {
    this.baseUrl = baseUrl;
    this.tokenProvider = tokenProvider;
  }

  private headers(): Record<string, string> {
    const token = this.tokenProvider();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  async get<T, P extends object = Record<string, never>>(path: string, params?: P): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const query = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (query) url += `?${query}`;
    }
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.json();
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.json();
  }

  async httpDelete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  }

  uploadFile(path: string, field: string, file: File): Promise<void> {
    const token = this.tokenProvider();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const formData = new FormData();
    formData.append(field, file);

    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    }).then((res) => {
      if (!res.ok) throw new Error(res.statusText);
    });
  }

  /**
   * POST a multipart form (a `File`/`Blob` plus any scalar fields) and parse the JSON response.
   * Used by the detached file service — `POST /api/files` with `file` + `refType`/`refId`/`role`.
   */
  async uploadMultipart<T>(
    path: string,
    fields: Record<string, string | number | Blob | undefined>
  ): Promise<T> {
    const token = this.tokenProvider();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      formData.append(key, value instanceof Blob ? value : String(value));
    }

    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: formData });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? res.statusText);
    }
    return res.json();
  }
}
