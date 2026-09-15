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
});
