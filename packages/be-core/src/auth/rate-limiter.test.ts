import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limiter';
import { defaultErrorHandler } from '../app/error-handler';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 2;

function buildApp(now: () => number) {
  const app = express();
  const limitAttempts = createRateLimiter({ windowMs: WINDOW_MS, max: MAX_ATTEMPTS, now });
  app.post('/login', limitAttempts, (_req, res) => {
    res.sendStatus(204);
  });
  app.post('/register', limitAttempts, (_req, res) => {
    res.sendStatus(204);
  });
  app.use(defaultErrorHandler);
  return app;
}

describe('createRateLimiter', () => {
  it('allows `max` requests per window, then answers 429 with Retry-After', async () => {
    let currentTime = 0;
    const app = buildApp(() => currentTime);

    expect((await request(app).post('/login')).status).toBe(204);
    expect((await request(app).post('/login')).status).toBe(204);
    const limited = await request(app).post('/login');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');

    currentTime = WINDOW_MS;
    expect((await request(app).post('/login')).status).toBe(204);
  });

  it('keeps a separate budget per route', async () => {
    const app = buildApp(() => 0);

    await request(app).post('/login');
    await request(app).post('/login');

    expect((await request(app).post('/login')).status).toBe(429);
    expect((await request(app).post('/register')).status).toBe(204);
  });

  it('shares one budget between every spelling of a route', async () => {
    const app = buildApp(() => 0);

    await request(app).post('/login');
    await request(app).post('/LOGIN');

    expect((await request(app).post('/Login/')).status).toBe(429);
  });

  it('counts only failed requests with skipSuccessfulRequests', async () => {
    const app = express();
    app.use(express.json());
    const limitFailures = createRateLimiter({
      windowMs: WINDOW_MS,
      max: MAX_ATTEMPTS,
      skipSuccessfulRequests: true,
      now: () => 0,
    });
    app.post('/login', limitFailures, (req, res) => {
      res.sendStatus(req.body.ok ? 204 : 401);
    });
    app.use(defaultErrorHandler);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(app).post('/login').send({ ok: true })).status).toBe(204);
    }
    expect((await request(app).post('/login').send({ ok: false })).status).toBe(401);
    expect((await request(app).post('/login').send({ ok: false })).status).toBe(401);
    expect((await request(app).post('/login').send({ ok: true })).status).toBe(429);
  });
});
