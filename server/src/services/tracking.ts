/**
 * Equipment tracking: the physical lifecycle of each booking (scheduled -> checked out
 * -> returned), overdue detection, late-return fines and fine settlement.
 */
import { FINE_CAP, FINE_PER_HOUR } from '../../../shared/constants.js';
import type { Booking, EquipmentView, User } from '../../../shared/types.js';
import type { Store } from '../data/store.js';
import { HttpError, forbidden, notFound } from '../lib/errors.js';
import type { CampusClock } from '../lib/time.js';
import { daysBetween } from '../lib/time.js';

export const statusOf = (b: Booking) => b.status ?? 'scheduled';

/** A unit is overdue once it is still checked out after its booking ended. */
export function isOverdue(b: Booking, now: CampusClock): boolean {
  if (statusOf(b) !== 'checked_out') return false;
  return b.date < now.date || (b.date === now.date && now.hour >= b.endHour);
}

/** Started hours past the booking end (at least 1 once overdue). */
export function overdueHours(b: Booking, now: CampusClock): number {
  const hours = daysBetween(b.date, now.date) * 24 + now.hour - b.endHour + 1;
  return Math.max(1, hours);
}

export const fineFor = (hours: number): number => Math.min(FINE_CAP, hours * FINE_PER_HOUR);

function getBooking(store: Store, id: string): Booking {
  const booking = store.allBookings().find((b) => b.id === id);
  if (!booking) throw notFound('Booking');
  return booking;
}

/** Faculty hands the unit to the student. Allowed on or after the booking day. */
export function checkOut(store: Store, bookingId: string, now: CampusClock): Booking {
  const booking = getBooking(store, bookingId);
  if (statusOf(booking) !== 'scheduled') {
    throw new HttpError(409, 'invalid_state', 'This booking has already been checked out');
  }
  if (booking.date > now.date) {
    throw new HttpError(409, 'too_early', 'Equipment can be handed out on the booking day');
  }
  booking.status = 'checked_out';
  booking.checkedOutAt = new Date().toISOString();
  return booking;
}

/** Faculty records the return; late returns get a fine and a fairness strike. */
export function returnItem(store: Store, bookingId: string, now: CampusClock): Booking {
  const booking = getBooking(store, bookingId);
  if (statusOf(booking) !== 'checked_out') {
    throw new HttpError(409, 'invalid_state', 'Only checked-out equipment can be returned');
  }
  if (isOverdue(booking, now)) {
    const hours = overdueHours(booking, now);
    booking.fine = { amount: fineFor(hours), overdueHours: hours, paid: false };
    const student = store.users.get(booking.userId);
    if (student) student.overdueStrikes = (student.overdueStrikes ?? 0) + 1;
  }
  booking.status = 'returned';
  booking.returnedAt = new Date().toISOString();
  return booking;
}

/** Student settles their own fine (demo payment confirmation). */
export function payFine(store: Store, user: User, bookingId: string): Booking {
  const booking = getBooking(store, bookingId);
  if (booking.userId !== user.id) throw forbidden();
  if (!booking.fine || booking.fine.paid) {
    throw new HttpError(409, 'no_fine', 'There is no unpaid fine on this booking');
  }
  booking.fine.paid = true;
  booking.fine.paidAt = new Date().toISOString();
  return booking;
}

export interface TrackedBooking extends Booking {
  equipment: EquipmentView | null;
  studentName: string;
  overdue: boolean;
  /** Fine if returned now (for overdue items still out). */
  accruingFine?: number;
}

export function track(store: Store, b: Booking, now: CampusClock): TrackedBooking {
  const e = store.equipment.get(b.equipmentId);
  const overdue = isOverdue(b, now);
  return {
    ...b,
    status: statusOf(b),
    equipment: e ? store.equipmentView(e) : null,
    studentName: store.users.get(b.userId)?.name ?? 'Unknown student',
    overdue,
    accruingFine: overdue ? fineFor(overdueHours(b, now)) : undefined,
  };
}

/** Faculty equipment desk: what is out (overdue first), what is due to collect, recent returns. */
export function deskView(store: Store, now: CampusClock) {
  const all = store.allBookings();
  const out = all
    .filter((b) => statusOf(b) === 'checked_out')
    .map((b) => track(store, b, now))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date));
  const toCollect = all
    .filter((b) => statusOf(b) === 'scheduled' && b.date === now.date)
    .sort((a, b) => a.startHour - b.startHour)
    .map((b) => track(store, b, now));
  const returned = all
    .filter((b) => statusOf(b) === 'returned')
    .sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
    .slice(0, 10)
    .map((b) => track(store, b, now));
  return {
    out,
    toCollect,
    returned,
    overdueCount: out.filter((b) => b.overdue).length,
    unpaidFines: all.filter((b) => b.fine && !b.fine.paid).reduce((s, b) => s + b.fine!.amount, 0),
  };
}
