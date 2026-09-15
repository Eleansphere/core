/** An access token plus, when the server issues one, the refresh token that renews it. */
export interface SessionTokens {
  token: string;
  refreshToken?: string;
}

/**
 * Where a session keeps its tokens. `load` runs on every request, so a store shared by several
 * tabs (`localStorage`) picks up tokens another tab renewed.
 */
export interface SessionStorage {
  load(): SessionTokens | null;
  save(tokens: SessionTokens): void;
  clear(): void;
}

export interface AuthSessionOptions {
  /** API origin, the same one the services use. */
  baseUrl: string;
  /** Default: in memory (lost on reload). In a browser use `createWebSessionStorage`. */
  storage?: SessionStorage;
  /** Called when the refresh token is rejected: the user has to sign in again. */
  onSessionExpired?: () => void;
  /** Default `/api/auth/refresh`. */
  refreshPath?: string;
}

const DEFAULT_REFRESH_PATH = '/api/auth/refresh';
/** Answers meaning the refresh token itself is unusable, as opposed to e.g. a server outage. */
const REJECTED_REFRESH_STATUSES = [400, 401];

export function createMemorySessionStorage(): SessionStorage {
  let tokens: SessionTokens | null = null;
  return {
    load: () => tokens,
    save: (next) => {
      tokens = next;
    },
    clear: () => {
      tokens = null;
    },
  };
}

function isSessionTokens(value: unknown): value is SessionTokens {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SessionTokens).token === 'string'
  );
}

/** Keeps the tokens in Web Storage (default `localStorage`) under `key`, shared by all tabs. */
export function createWebSessionStorage(
  key: string,
  storage: Storage = globalThis.localStorage
): SessionStorage {
  return {
    load() {
      try {
        const stored: unknown = JSON.parse(storage.getItem(key) ?? 'null');
        return isSessionTokens(stored) ? stored : null;
      } catch {
        return null;
      }
    },
    save: (tokens) => storage.setItem(key, JSON.stringify(tokens)),
    clear: () => storage.removeItem(key),
  };
}

/**
 * The signed-in user's tokens, renewed with the refresh token when the access token expires. Pass
 * it to `createServiceContainer` instead of a token function: a request answered with 401 is then
 * retried once, after a refresh shared by every request that failed at the same time.
 */
export class AuthSession {
  private readonly storage: SessionStorage;
  private pendingRefresh: Promise<boolean> | undefined;

  constructor(private readonly options: AuthSessionOptions) {
    this.storage = options.storage ?? createMemorySessionStorage();
  }

  get accessToken(): string | null {
    return this.storage.load()?.token ?? null;
  }

  get isSignedIn(): boolean {
    return this.accessToken !== null;
  }

  /** Stores the tokens of a login, registration or password change. */
  start(tokens: SessionTokens): void {
    this.storage.save(tokens);
  }

  /** Forgets the tokens locally. Call the server's `logout` first to revoke the refresh token. */
  end(): void {
    this.storage.clear();
  }

  /**
   * Renews the access token; resolves `true` when a usable token is available afterwards.
   * `rejectedToken` is the token a request just failed with — when the stored token already
   * differs (another request or tab renewed it), nothing is sent.
   */
  refresh(rejectedToken?: string | null): Promise<boolean> {
    const stored = this.storage.load();
    if (!stored?.refreshToken) return Promise.resolve(false);
    if (rejectedToken !== undefined && stored.token !== rejectedToken) return Promise.resolve(true);

    if (!this.pendingRefresh) {
      this.pendingRefresh = this.requestNewTokens(stored.refreshToken).finally(() => {
        this.pendingRefresh = undefined;
      });
    }
    return this.pendingRefresh;
  }

  private async requestNewTokens(refreshToken: string): Promise<boolean> {
    const refreshPath = this.options.refreshPath ?? DEFAULT_REFRESH_PATH;
    const response = await fetch(`${this.options.baseUrl}${refreshPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      this.storage.save((await response.json()) as SessionTokens);
      return true;
    }
    if (REJECTED_REFRESH_STATUSES.includes(response.status)) {
      this.storage.clear();
      this.options.onSessionExpired?.();
    }
    return false;
  }
}
