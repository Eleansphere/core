import type { RequestHandler } from 'express';

const ONE_HUNDRED_EIGHTY_DAYS_SECONDS = 180 * 24 * 60 * 60;

/**
 * Headers every API answer carries. An API sends JSON and files, never pages, so nothing it
 * serves may run scripts, be framed or be sniffed into another type. Files stay embeddable from
 * other origins (`Cross-Origin-Resource-Policy: cross-origin`): a web app on its own domain shows
 * the API's images.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Strict-Transport-Security': `max-age=${ONE_HUNDRED_EIGHTY_DAYS_SECONDS}`,
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  next();
};
