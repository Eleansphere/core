import { Request, RequestHandler } from 'express';
import { HttpError } from '../app/error-handler';

export interface RateLimitConfig {
  windowMs: number;
  /** Requests allowed per key within one window. */
  max: number;
}

export interface RateLimiterOptions extends RateLimitConfig {
  /** Which requests share a budget. Default: client IP plus route. */
  keyOf?: (req: Request) => string;
  /** Clock, for tests. */
  now?: () => number;
}

/** Applied to credential-guessing routes (login, register, password reset, account deletion). */
export const DEFAULT_AUTH_RATE_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 20 };

const MILLISECONDS_PER_SECOND = 1000;
/** Expired windows are swept once the map grows past this, keeping memory bounded. */
const PRUNE_THRESHOLD = 1000;

interface Window {
  count: number;
  resetAt: number;
}

function clientRouteKey(req: Request): string {
  return `${req.ip}:${req.baseUrl}${req.path}`;
}

function pruneExpired(windows: Map<string, Window>, currentTime: number): void {
  if (windows.size < PRUNE_THRESHOLD) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= currentTime) windows.delete(key);
  }
}

/**
 * Fixed-window rate limiter kept in memory: right for a single instance (each additional instance
 * gets its own budget). Over the limit it answers 429 with `Retry-After`. Behind a proxy, set
 * `AppConfig.trustProxy` so `req.ip` is the real client.
 */
export function createRateLimiter({
  windowMs,
  max,
  keyOf = clientRouteKey,
  now = Date.now,
}: RateLimiterOptions): RequestHandler {
  const windows = new Map<string, Window>();

  return (req, res, next) => {
    const currentTime = now();
    pruneExpired(windows, currentTime);

    const key = keyOf(req);
    const window = windows.get(key);
    if (!window || window.resetAt <= currentTime) {
      windows.set(key, { count: 1, resetAt: currentTime + windowMs });
      return next();
    }

    window.count += 1;
    if (window.count > max) {
      const retryAfterSeconds = Math.ceil((window.resetAt - currentTime) / MILLISECONDS_PER_SECOND);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return next(new HttpError(429, 'Too many requests, try again later'));
    }
    next();
  };
}
