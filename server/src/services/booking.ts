import { CLOSE_HOUR, OPEN_HOUR } from '../../../shared/constants.js';
import type { Booking, EquipmentView } from '../../../shared/types.js';
import { Store } from '../data/store.js';
import { HttpError, notFound } from '../lib/errors.js';
import type { CampusClock } from '../lib/time.js';
import { dateRange } from '../lib/time.js';
import { hasOverlap, occupiedSlots, slotKey } from './availability.js';

export interface BookingInput {
  equipmentId: string;
  date: string;
  startHour: number;
  hours: number;
}

export interface TimeWindow {
  date: string;
  startHour: number;
  endHour: number;
}

export interface Alternatives {
  sameEquipment: TimeWindow[];
  equivalents: (TimeWindow & { equipment: EquipmentView })[];
}

export type BookingOutcome =
  { ok: true; booking: Booking } | { ok: false; reason: 'conflict'; alternatives: Alternatives };

/** Contiguous free windows of `hours` length on one unit, earliest first. */
export function findWindows(
  equipmentId: string,
  taken: Set<string>,
  now: CampusClock,
  fromDate: string,
  lastDate: string,
  hours: number,
  limit: number,
): TimeWindow[] {
  const out: TimeWindow[] = [];
  const start = fromDate < now.date ? now.date : fromDate;
  for (const date of dateRange(start, lastDate)) {
    const first = date === now.date ? Math.max(OPEN_HOUR, now.hour + 1) : OPEN_HOUR;
    for (let h = first; h + hours <= CLOSE_HOUR; h++) {
      if (!hasOverlap(taken, equipmentId, date, h, h + hours)) {
        out.push({ date, startHour: h, endHour: h + hours });
        if (out.length >= limit) return out;
        h += hours - 1; // skip overlapping suggestions
      }
    }
  }
  return out;
}

function userBusy(store: Store, userId: string, date: string, start: number, end: number): boolean {
  return store
    .allBookings()
    .some((b) => b.userId === userId && b.date === date && b.startHour < end && start < b.endHour);
}

/**
 * Books a slot if free; otherwise returns the nearest alternatives on the same unit
 * and same-time availability on equivalent units in other labs.
 */
export function createBooking(
  store: Store,
  userId: string,
  input: BookingInput,
  now: CampusClock,
  horizonEnd: string,
): BookingOutcome {
  const equipment = store.equipment.get(input.equipmentId);
  if (!equipment) throw notFound('Equipment');
  if (equipment.status !== 'available') {
    throw new HttpError(409, 'maintenance', `${equipment.name} is under maintenance`);
  }
  const endHour = input.startHour + input.hours;
  if (input.date < now.date || (input.date === now.date && input.startHour <= now.hour)) {
    throw new HttpError(400, 'past_slot', 'That time has already started');
  }
  if (input.date > horizonEnd) {
    throw new HttpError(400, 'beyond_horizon', 'Bookings can only be made up to 3 weeks ahead');
  }
  if (userBusy(store, userId, input.date, input.startHour, endHour)) {
    throw new HttpError(409, 'user_busy', 'You already have a booking at that time');
  }

  const taken = occupiedSlots(store.allBookings());
  if (!hasOverlap(taken, equipment.id, input.date, input.startHour, endHour)) {
    const booking = store.addBooking({
      id: Store.newId('bk'),
      equipmentId: equipment.id,
      userId,
      date: input.date,
      startHour: input.startHour,
      endHour,
    });
    return { ok: true, booking };
  }

  const sameEquipment = findWindows(
    equipment.id,
    taken,
    now,
    input.date,
    horizonEnd,
    input.hours,
    3,
  );
  const equivalents = [...store.equipment.values()]
    .filter(
      (e) =>
        e.id !== equipment.id &&
        e.equivalentGroup === equipment.equivalentGroup &&
        e.status === 'available' &&
        !hasOverlap(taken, e.id, input.date, input.startHour, endHour),
    )
    .map((e) => ({
      equipment: store.equipmentView(e),
      date: input.date,
      startHour: input.startHour,
      endHour,
    }));
  return { ok: false, reason: 'conflict', alternatives: { sameEquipment, equivalents } };
}

/** Booked and free hours for one unit over a date range, for calendar rendering. */
export function availabilityGrid(store: Store, equipmentId: string, from: string, to: string) {
  const taken = occupiedSlots(store.bookingsFor(equipmentId));
  return dateRange(from, to).map((date) => ({
    date,
    hours: Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => {
      const hour = OPEN_HOUR + i;
      return { hour, booked: taken.has(slotKey(equipmentId, date, hour)) };
    }),
  }));
}
