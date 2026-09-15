import { describe, it, expect } from 'vitest';
import { isDateOnly, toDateOnlyIn, todayIn, addDays, daysBetween, compareDateOnly } from './dates';

describe('isDateOnly', () => {
  it.each(['2026-09-15', '2028-02-29', '0001-01-01'])('accepts %s', (value) => {
    expect(isDateOnly(value)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-9-15', '2026-09-15T00:00:00Z', '', 20260915, null])(
    'rejects %j',
    (value) => {
      expect(isDateOnly(value)).toBe(false);
    }
  );
});

describe('toDateOnlyIn / todayIn', () => {
  // 23:30 UTC on 28 March is already 29 March in Prague (UTC+1, DST starts that night).
  const lateEveningUtc = new Date('2026-03-28T23:30:00Z');

  it('uses the calendar date of the given time zone', () => {
    expect(toDateOnlyIn(lateEveningUtc, 'UTC')).toBe('2026-03-28');
    expect(toDateOnlyIn(lateEveningUtc, 'Europe/Prague')).toBe('2026-03-29');
    expect(toDateOnlyIn(lateEveningUtc, 'America/New_York')).toBe('2026-03-28');
  });

  it('todayIn accepts a pinned clock', () => {
    expect(todayIn('Europe/Prague', lateEveningUtc)).toBe('2026-03-29');
  });
});

describe('addDays / daysBetween / compareDateOnly', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not affected by daylight-saving changes', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('counts days in both directions', () => {
    expect(daysBetween('2026-09-15', '2026-09-22')).toBe(7);
    expect(daysBetween('2026-09-22', '2026-09-15')).toBe(-7);
    expect(daysBetween('2026-09-15', '2026-09-15')).toBe(0);
  });

  it('sorts dates chronologically', () => {
    expect(['2026-10-01', '2025-12-31', '2026-01-15'].sort(compareDateOnly)).toEqual([
      '2025-12-31',
      '2026-01-15',
      '2026-10-01',
    ]);
  });

  it('throws on a malformed date instead of returning garbage', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});
