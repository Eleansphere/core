import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthSession, createMemorySessionStorage, createWebSessionStorage } from './auth-session';
import { ApiClient } from './api-client';
import { ApiError } from './api-error';

const BASE_URL = 'http://api.test';
const REFRESH_URL = `${BASE_URL}/api/auth/refresh`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function authorizationOf(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

/** API accepting only `Bearer fresh`; the refresh endpoint answers with `refreshStatus`. */
function stubApi(refreshStatus = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === REFRESH_URL) {
      return refreshStatus === 200
        ? jsonResponse(200, { token: 'fresh', refreshToken: 'rt-2' })
        : jsonResponse(refreshStatus, { error: 'Unauthorized' });
    }
    return authorizationOf(init) === 'Bearer fresh'
      ? jsonResponse(200, { ok: true })
      : jsonResponse(401, { error: 'Unauthorized' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const requestedUrls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([url]) => url);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthSession with an ApiClient', () => {
  it('renews an expired access token once and retries the request', async () => {
    const fetchMock = stubApi();
    const session = new AuthSession({ baseUrl: BASE_URL });
    session.start({ token: 'stale', refreshToken: 'rt-1' });

    await expect(new ApiClient(BASE_URL, session).get('/api/books')).resolves.toEqual({ ok: true });

    expect(session.accessToken).toBe('fresh');
    expect(requestedUrls(fetchMock)).toEqual([
      `${BASE_URL}/api/books`,
      REFRESH_URL,
      `${BASE_URL}/api/books`,
    ]);
  });

  it('shares one refresh between requests failing at the same time', async () => {
    const fetchMock = stubApi();
    const session = new AuthSession({ baseUrl: BASE_URL });
    session.start({ token: 'stale', refreshToken: 'rt-1' });
    const client = new ApiClient(BASE_URL, session);

    await Promise.all([client.get('/api/books'), client.get('/api/loans'), client.get('/api/me')]);

    expect(requestedUrls(fetchMock).filter((url) => url === REFRESH_URL)).toHaveLength(1);
  });

  it('ends the session and reports it when the refresh token is rejected', async () => {
    stubApi(401);
    const onSessionExpired = vi.fn();
    const session = new AuthSession({ baseUrl: BASE_URL, onSessionExpired });
    session.start({ token: 'stale', refreshToken: 'revoked' });

    const request = new ApiClient(BASE_URL, session).get('/api/books');

    await expect(request).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(session.isSignedIn).toBe(false);
  });

  it('does not try to renew an anonymous request', async () => {
    const fetchMock = stubApi();
    const session = new AuthSession({ baseUrl: BASE_URL });

    await expect(new ApiClient(BASE_URL, session).get('/api/books')).rejects.toMatchObject({
      status: 401,
    });
    expect(requestedUrls(fetchMock)).toEqual([`${BASE_URL}/api/books`]);
  });

  it('retries with a token renewed elsewhere instead of refreshing again', async () => {
    const storage = createMemorySessionStorage();
    const session = new AuthSession({ baseUrl: BASE_URL, storage });
    session.start({ token: 'stale', refreshToken: 'rt-1' });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (authorizationOf(init) === 'Bearer stale') {
        // Another tab renewed the tokens while this request was in flight.
        storage.save({ token: 'fresh', refreshToken: 'rt-2' });
        return jsonResponse(401, { error: 'Unauthorized' });
      }
      return url === REFRESH_URL ? jsonResponse(500, {}) : jsonResponse(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ApiClient(BASE_URL, session).get('/api/books')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(REFRESH_URL);
  });
});

describe('createWebSessionStorage', () => {
  it('round-trips tokens and treats unreadable data as signed out', () => {
    const entries = new Map<string, string>();
    const webStorage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    } as unknown as Storage;
    const storage = createWebSessionStorage('session', webStorage);

    storage.save({ token: 't', refreshToken: 'r' });
    expect(storage.load()).toEqual({ token: 't', refreshToken: 'r' });

    entries.set('session', '{not json');
    expect(storage.load()).toBeNull();

    storage.clear();
    expect(entries.has('session')).toBe(false);
  });
});
