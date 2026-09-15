const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

const MILLISECONDS_PER_UNIT: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Milliseconds in a duration such as `'15m'` or `'60d'` (units `ms`, `s`, `m`, `h`, `d`) — the
 * same notation `jsonwebtoken`'s `expiresIn` accepts, so one config value can serve both.
 */
export function parseDuration(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) throw new Error(`Invalid duration "${duration}" (expected e.g. "15m" or "60d")`);
  const [, amount, unit] = match;
  return Number(amount) * MILLISECONDS_PER_UNIT[unit];
}
