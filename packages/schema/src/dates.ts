/**
 * Calendar-date helpers for `DATEONLY` values (`YYYY-MM-DD`). All arithmetic runs on UTC midnight,
 * so daylight-saving changes can never shift a date. Time zones only matter when turning an
 * instant into a date: see {@link toDateOnlyIn}.
 */

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
/** `en-CA` formats dates as `YYYY-MM-DD` parts, which is exactly the `DATEONLY` shape. */
const ISO_ORDER_LOCALE = 'en-CA';

function toUtcMidnight(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0–99 to 1900–1999.
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

function parseDateOnly(value: string): Date | undefined {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = toUtcMidnight(year, month - 1, day);
  const isRealCalendarDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealCalendarDate ? date : undefined;
}

function requireDateOnly(value: string): Date {
  const date = parseDateOnly(value);
  if (!date) throw new RangeError(`Not a calendar date (expected YYYY-MM-DD): ${value}`);
  return date;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `true` for a `YYYY-MM-DD` string naming a real calendar date (so `2026-02-30` is rejected). */
export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && parseDateOnly(value) !== undefined;
}

/** The calendar date `instant` falls on in `timeZone` (an IANA name such as `Europe/Prague`). */
export function toDateOnlyIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(ISO_ORDER_LOCALE, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${partValue('year')}-${partValue('month')}-${partValue('day')}`;
}

/** Today's calendar date in `timeZone`. Pass `now` to pin the clock (tests, scheduled jobs). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return toDateOnlyIn(now, timeZone);
}

/** `date` moved by `days` calendar days; negative `days` goes back. */
export function addDays(date: string, days: number): string {
  const shifted = requireDateOnly(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatUtcDate(shifted);
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (requireDateOnly(to).getTime() - requireDateOnly(from).getTime()) / MILLISECONDS_PER_DAY
  );
}

/** Sort comparator for calendar dates: negative, zero or positive. */
export function compareDateOnly(left: string, right: string): number {
  return daysBetween(right, left);
}
