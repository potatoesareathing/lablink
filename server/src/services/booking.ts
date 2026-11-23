import { CLOSE_HOUR, OPEN_HOUR } from '../../../shared/constants.js';
import type { Booking, Equipment, EquipmentView } from '../../../shared/types.js';
import { Store } from '../data/store.js';
import { HttpError, notFound } from '../lib/errors.js';
import type { CampusClock } from '../lib/time.js';
import { dateRange } from '../lib/time.js';
import { hasOverlap, occupiedSlots, slotKey } from './availability.js';

/** How many alternative windows on the same unit to suggest after a clash. */
const ALTERNATIVE_WINDOWS = 3;

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

/** Booking window: the current campus time and the last bookable date. */
export interface BookingClock {
  now: CampusClock;
  horizonEnd: string;
}

export interface WindowQuery {
  equipmentId: string;
  fromDate: string;
  lastDate: string;
  hours: number;
  limit: number;
}

/** Contiguous, non-overlapping free windows of `hours` length on one unit, earliest first. */
export function findWindows(taken: Set<string>, now: CampusClock, q: WindowQuery): TimeWindow[] {
  const out: TimeWindow[] = [];
  const start = q.fromDate < now.date ? now.date : q.fromDate;
  for (const date of dateRange(start, q.lastDate)) {
    const first = date === now.date ? Math.max(OPEN_HOUR, now.hour + 1) : OPEN_HOUR;
    let h = first;
    while (h + q.hours <= CLOSE_HOUR && out.length < q.limit) {
      const window = { date, startHour: h, endHour: h + q.hours };
      const free = !hasOverlap(taken, { equipmentId: q.equipmentId, ...window });
      if (free) out.push(window);
      h += free ? q.hours : 1;
    }
  }
  return out;
}

function userBusy(store: Store, userId: string, w: TimeWindow): boolean {
  return store
    .allBookings()
    .some(
      (b) =>
        b.userId === userId &&
        b.date === w.date &&
        b.startHour < w.endHour &&
        w.startHour < b.endHour,
    );
}

/** Rejects maintenance units, past or out-of-horizon times and student double-booking. */
interface BookingAttempt {
  userId: string;
  equipment: Equipment;
  window: TimeWindow;
}

function assertBookable(
  store: Store,
  { userId, equipment, window }: BookingAttempt,
  { now, horizonEnd }: BookingClock,
): void {
  if (equipment.status !== 'available') {
    throw new HttpError(409, 'maintenance', `${equipment.name} is under maintenance`);
  }
  const started = window.date === now.date && window.startHour <= now.hour;
  if (window.date < now.date || started) {
    throw new HttpError(400, 'past_slot', 'That time has already started');
  }
  if (window.date > horizonEnd) {
    throw new HttpError(400, 'beyond_horizon', 'Bookings can only be made up to 3 weeks ahead');
  }
  if (userBusy(store, userId, window)) {
    throw new HttpError(409, 'user_busy', 'You already have a booking at that time');
  }
}

/** Nearest free windows on the same unit, plus equivalent units free at the same time. */
function alternativesFor(
  store: Store,
  equipment: Equipment,
  window: TimeWindow,
  { now, horizonEnd }: BookingClock,
): Alternatives {
  const taken = occupiedSlots(store.allBookings());
  const sameEquipment = findWindows(taken, now, {
    equipmentId: equipment.id,
    fromDate: window.date,
    lastDate: horizonEnd,
    hours: window.endHour - window.startHour,
    limit: ALTERNATIVE_WINDOWS,
  });
  const equivalents = [...store.equipment.values()]
    .filter(
      (e) =>
        e.id !== equipment.id &&
        e.equivalentGroup === equipment.equivalentGroup &&
        e.status === 'available' &&
        !hasOverlap(taken, { equipmentId: e.id, ...window }),
    )
    .map((e) => ({ equipment: store.equipmentView(e), ...window }));
  return { sameEquipment, equivalents };
}

/**
 * Books a slot if free; otherwise returns the nearest alternatives on the same unit
 * and same-time availability on equivalent units in other labs.
 */
export function createBooking(
  store: Store,
  userId: string,
  input: BookingInput,
  clock: BookingClock,
): BookingOutcome {
  const equipment = store.equipment.get(input.equipmentId);
  if (!equipment) throw notFound('Equipment');
  const window = {
    date: input.date,
    startHour: input.startHour,
    endHour: input.startHour + input.hours,
  };
  assertBookable(store, { userId, equipment, window }, clock);

  const taken = occupiedSlots(store.bookingsFor(equipment.id));
  if (hasOverlap(taken, { equipmentId: equipment.id, ...window })) {
    return {
      ok: false,
      reason: 'conflict',
      alternatives: alternativesFor(store, equipment, window, clock),
    };
  }
  const booking = store.addBooking({
    id: Store.newId('bk'),
    equipmentId: equipment.id,
    userId,
    ...window,
  });
  return { ok: true, booking };
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
