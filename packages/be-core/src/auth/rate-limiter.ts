import { Request, RequestHandler } from 'express';
import { HttpError } from '../app/error-handler';

export interface RateLimitConfig {
  windowMs: number;
  /** Requests allowed per key within one window. */
  max: number;
}

export interface RateLimiterOptions extends RateLimitConfig {
  /**
   * Which requests share a budget. Default: client IP plus the matched route, so `/Login`,
   * `/login/` and `/login` share one.
   */
  keyOf?: (req: Request) => string;
  /**
   * Counts only requests answered with an error (status 400 or above), e.g. failed sign-ins:
   * successful ones give their attempt back once the response is sent.
   */
  skipSuccessfulRequests?: boolean;
  /** Clock, for tests. */
  now?: () => number;
}

/** Applied to credential-guessing routes (login, register, password reset, account deletion). */
export const DEFAULT_AUTH_RATE_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 20 };

/**
 * Failed sign-ins per account (by e-mail), from any client: stops guessing one password from many
 * addresses. Successful sign-ins don't count, so the owner keeps getting in.
 */
export const DEFAULT_ACCOUNT_RATE_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 10 };

const FIRST_ERROR_STATUS = 400;
const TRAILING_SLASHES = /\/+$/;

const MILLISECONDS_PER_SECOND = 1000;
/** Expired windows are swept once the map grows past this, keeping memory bounded. */
const PRUNE_THRESHOLD = 1000;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * The route a request matched, the same however its path was typed: Express routes ignore letter
 * case and a trailing slash, so the key must too — or every spelling would get its own budget.
 */
export function routeKey(req: Request): string {
  const path = typeof req.route?.path === 'string' ? req.route.path : req.path;
  return `${req.baseUrl}${path}`.toLowerCase().replace(TRAILING_SLASHES, '') || '/';
}

function clientRouteKey(req: Request): string {
  return `${req.ip}:${routeKey(req)}`;
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
  skipSuccessfulRequests = false,
  now = Date.now,
}: RateLimiterOptions): RequestHandler {
  const windows = new Map<string, Window>();

  return (req, res, next) => {
    const currentTime = now();
    pruneExpired(windows, currentTime);

    const key = keyOf(req);
    let window = windows.get(key);
    if (!window || window.resetAt <= currentTime) {
      window = { count: 0, resetAt: currentTime + windowMs };
      windows.set(key, window);
    }

    if (window.count >= max) {
      const retryAfterSeconds = Math.ceil((window.resetAt - currentTime) / MILLISECONDS_PER_SECOND);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return next(new HttpError(429, 'Too many requests, try again later'));
    }

    window.count += 1;
    if (skipSuccessfulRequests) {
      const counted = window;
      res.on('finish', () => {
        if (res.statusCode < FIRST_ERROR_STATUS && windows.get(key) === counted) {
          counted.count = Math.max(0, counted.count - 1);
        }
      });
    }
    next();
  };
}
