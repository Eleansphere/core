import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthService } from './auth.service';

const BASE_URL = 'http://api.test';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthService', () => {
  it('confirms account deletion with the password, and handles empty 204 answers', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthService(BASE_URL, () => 'token-1');

    await expect(auth.deleteMe('secret-password')).resolves.toBeUndefined();
    await expect(auth.logout('rt_1.secret')).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/auth/me`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'DELETE',
      body: '{"password":"secret-password"}',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE_URL}/api/auth/logout`);
  });

  it('sends profile changes with PATCH', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 'u_1', email: 'a@b.cz', displayName: 'Bob' }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthService<{ id: string; email: string; displayName: string }>(
      BASE_URL,
      () => 'token-1'
    );

    const user = await auth.updateMe({ displayName: 'Bob' });

    expect(user.displayName).toBe('Bob');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
  });
});
