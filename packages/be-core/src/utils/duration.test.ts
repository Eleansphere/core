import { describe, it, expect } from 'vitest';
import { parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['250ms', 250],
    ['30s', 30_000],
    ['15m', 900_000],
    ['2h', 7_200_000],
    ['60d', 5_184_000_000],
  ])('parses %s', (duration, milliseconds) => {
    expect(parseDuration(duration)).toBe(milliseconds);
  });

  it.each(['15', '1w', '-5m', '1.5h', ''])('rejects %j', (duration) => {
    expect(() => parseDuration(duration)).toThrow(/Invalid duration/);
  });
});
