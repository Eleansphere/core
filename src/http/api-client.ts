import { HttpTransport } from './http-transport';

/**
 * The JSON CRUD verbs every generated entity service (and `AuthService`) is built on. Transport
 * concerns (auth headers, error handling) live in `HttpTransport`; file upload lives in
 * `FilesClient` — this class is just `get`/`post`/`put`/`httpDelete`.
 */
export class ApiClient extends HttpTransport {
  get<T, P extends object = Record<string, never>>(path: string, params?: P): Promise<T> {
    return this.getJson<T, P>(path, params);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.postJson<T>(path, body);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.putJson<T>(path, body);
  }

  httpDelete(path: string): Promise<void> {
    return this.deleteRequest(path);
  }
}
