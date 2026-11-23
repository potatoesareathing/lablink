/**
 * Calendar helpers working on campus-local dates (YYYY-MM-DD strings).
 * All arithmetic is done in UTC on date-only values to avoid DST/timezone drift.
 */

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CampusClock {
  date: string;
  hour: number;
}

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Current campus date and hour given an offset from UTC in minutes. */
export function campusNow(offsetMinutes: number, now: Date = new Date()): CampusClock {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

/** ISO week window (Mon..Sun) that contains `date`. */
export function weekBounds(date: string): { start: string; end: string } {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const start = addDays(date, -((dow + 6) % 7));
  return { start, end: addDays(start, 6) };
}
