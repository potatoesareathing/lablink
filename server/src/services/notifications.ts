/**
 * In-app notifications, derived from current state so they are always consistent
 * and need no separate storage. Email delivery can be layered on later.
 */
import type { Notification, User } from '../../../shared/types.js';
import type { Store } from '../data/store.js';
import type { CampusClock } from '../lib/time.js';
import { addDays } from '../lib/time.js';
import { fineFor, isOverdue, overdueHours, statusOf } from './tracking.js';

const STATUS_COPY = {
  approved: { tone: 'ok', verb: 'was approved and scheduled' },
  partial: { tone: 'warn', verb: 'was partially approved' },
  waitlisted: { tone: 'warn', verb: 'was waitlisted' },
  rejected: { tone: 'bad', verb: 'was not approved' },
} as const;

export function notificationsFor(store: Store, user: User, now: CampusClock): Notification[] {
  const out: Notification[] = [];
  const name = (equipmentId: string) => store.equipment.get(equipmentId)?.name ?? 'Equipment';
  const bookings = store.allBookings();

  if (user.role === 'faculty') {
    const pending = [...store.requests.values()].filter((r) => r.status === 'pending').length;
    if (pending) {
      out.push({
        id: 'pending',
        tone: 'info',
        title: `${pending} request${pending > 1 ? 's' : ''} waiting for approval`,
        detail: 'Open Approvals to review them.',
      });
    }
    for (const b of bookings.filter((x) => isOverdue(x, now))) {
      out.push({
        id: `overdue-${b.id}`,
        tone: 'bad',
        title: `${name(b.equipmentId)} is overdue`,
        detail: `${store.users.get(b.userId)?.name ?? 'A student'} has not returned it (${overdueHours(b, now)} h late).`,
      });
    }
    return out;
  }

  for (const b of bookings.filter((x) => x.userId === user.id)) {
    if (isOverdue(b, now)) {
      out.push({
        id: `overdue-${b.id}`,
        tone: 'bad',
        title: `Return ${name(b.equipmentId)} now`,
        detail: `It is ${overdueHours(b, now)} h overdue; a fine of ₹${fineFor(overdueHours(b, now))} is accruing.`,
      });
    } else if (b.fine && !b.fine.paid) {
      out.push({
        id: `fine-${b.id}`,
        tone: 'warn',
        title: `Unpaid fine: ₹${b.fine.amount}`,
        detail: `Late return of ${name(b.equipmentId)}. Pay it from My bookings.`,
      });
    } else if (
      statusOf(b) === 'scheduled' &&
      (b.date === now.date || b.date === addDays(now.date, 1))
    ) {
      out.push({
        id: `soon-${b.id}`,
        tone: 'info',
        title: `${name(b.equipmentId)} ${b.date === now.date ? 'today' : 'tomorrow'} at ${b.startHour}:00`,
        detail: 'Collect it from the lab at the start of your slot.',
      });
    }
  }

  for (const r of store.requests.values()) {
    if (r.studentId !== user.id || r.status === 'pending') continue;
    const copy = STATUS_COPY[r.status];
    out.push({
      id: `request-${r.id}`,
      tone: copy.tone,
      title: `"${r.projectTitle}" ${copy.verb}`,
      detail: r.facultyNote
        ? `Faculty note: ${r.facultyNote}`
        : 'See Project requests for details.',
    });
  }
  return out;
}
