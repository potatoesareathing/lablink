import { CLOSE_HOUR, OPEN_HOUR } from '../../../shared/constants.js';
import type { Booking, Slot } from '../../../shared/types.js';
import { dateRange } from '../lib/time.js';
import type { CampusClock } from '../lib/time.js';

/** Key identifying one bookable hour on one equipment unit. */
export const slotKey = (equipmentId: string, date: string, hour: number): string =>
  `${equipmentId}|${date}|${hour}`;

/** Set of occupied slot keys derived from bookings. */
export function occupiedSlots(bookings: Iterable<Booking>): Set<string> {
  const taken = new Set<string>();
  for (const b of bookings) {
    for (let h = b.startHour; h < b.endHour; h++) taken.add(slotKey(b.equipmentId, b.date, h));
  }
  return taken;
}

/** A [startHour, endHour) range on one unit and date. */
export interface UnitRange {
  equipmentId: string;
  date: string;
  startHour: number;
  endHour: number;
}

/** True if the range overlaps any occupied hour. */
export function hasOverlap(taken: Set<string>, range: UnitRange): boolean {
  for (let h = range.startHour; h < range.endHour; h++) {
    if (taken.has(slotKey(range.equipmentId, range.date, h))) return true;
  }
  return false;
}

/**
 * Free 1-hour slots for one equipment unit between `now` and `lastDate` (inclusive),
 * in chronological order. Hours that have already started today are excluded.
 */
export function freeSlots(
  equipmentId: string,
  taken: Set<string>,
  now: CampusClock,
  lastDate: string,
): Slot[] {
  if (lastDate < now.date) return [];
  const out: Slot[] = [];
  for (const date of dateRange(now.date, lastDate)) {
    const firstHour = date === now.date ? Math.max(OPEN_HOUR, now.hour + 1) : OPEN_HOUR;
    for (let hour = firstHour; hour < CLOSE_HOUR; hour++) {
      if (!taken.has(slotKey(equipmentId, date, hour))) out.push({ equipmentId, date, hour });
    }
  }
  return out;
}

/** Collapses consecutive hours on the same unit and date into booking-shaped ranges. */
export function mergeSlots(slots: Slot[]): UnitRange[] {
  const sorted = [...slots].sort(
    (a, b) =>
      a.equipmentId.localeCompare(b.equipmentId) || a.date.localeCompare(b.date) || a.hour - b.hour,
  );
  const ranges: UnitRange[] = [];
  for (const s of sorted) {
    const last = ranges[ranges.length - 1];
    if (
      last &&
      last.equipmentId === s.equipmentId &&
      last.date === s.date &&
      last.endHour === s.hour
    ) {
      last.endHour += 1;
    } else {
      ranges.push({
        equipmentId: s.equipmentId,
        date: s.date,
        startHour: s.hour,
        endHour: s.hour + 1,
      });
    }
  }
  return ranges;
}
