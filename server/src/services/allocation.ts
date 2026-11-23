/**
 * Fair allocation engine.
 *
 * Deterministic by design: the language model never makes scheduling decisions.
 * Requests competing for the same kind of equipment are scored on deadline urgency,
 * fairness (recent usage and denials) and feasibility, then greedily assigned the
 * earliest free slots before their deadline - first on the requested unit, then on
 * equivalent units in other labs. Guarantees:
 *   - no two bookings overlap on the same unit,
 *   - a student is never booked on two units at the same hour,
 *   - nothing is scheduled after a request's deadline.
 */
import { OVERDUE_STRIKE_PENALTY, WEEKLY_FAIR_SHARE_HOURS } from '../../../shared/constants.js';
import type {
  AccessRequest,
  AllocationResult,
  Booking,
  Equipment,
  ReasonCode,
  Slot,
  User,
} from '../../../shared/types.js';
import { daysBetween, weekBounds } from '../lib/time.js';
import type { CampusClock } from '../lib/time.js';
import { freeSlots, occupiedSlots, slotKey } from './availability.js';

export const WEIGHTS = { urgency: 0.5, fairness: 0.3, feasibility: 0.2 } as const;

export interface AllocationInput {
  requests: AccessRequest[];
  equipment: Equipment[];
  bookings: Booking[];
  users: ReadonlyMap<string, User>;
  now: CampusClock;
}

export interface PriorityBreakdown {
  urgency: number;
  fairness: number;
  feasibility: number;
  priority: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Hours each user already holds in the current week. */
export function weeklyHours(bookings: Booking[], now: CampusClock): Map<string, number> {
  const { start, end } = weekBounds(now.date);
  const totals = new Map<string, number>();
  for (const b of bookings) {
    if (b.date < start || b.date > end) continue;
    totals.set(b.userId, (totals.get(b.userId) ?? 0) + (b.endHour - b.startHour));
  }
  return totals;
}

/** Units that can satisfy a request: the requested one first, then equivalents. */
export function candidateUnits(request: AccessRequest, equipment: Equipment[]): Equipment[] {
  const requested = equipment.find((e) => e.id === request.equipmentId);
  if (!requested) return [];
  const usable = (e: Equipment) => e.status === 'available';
  const equivalents = equipment
    .filter((e) => e.id !== requested.id && e.equivalentGroup === requested.equivalentGroup)
    .filter(usable)
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...(usable(requested) ? [requested] : []), ...equivalents];
}

export function scoreRequest(
  request: AccessRequest,
  user: User | undefined,
  hoursThisWeek: number,
  freeHoursBeforeDeadline: number,
  now: CampusClock,
): PriorityBreakdown {
  const daysLeft = Math.max(0, daysBetween(now.date, request.deadline));
  const urgency = 1 / (1 + daysLeft);
  const usagePenalty = Math.min(1, hoursThisWeek / WEEKLY_FAIR_SHARE_HOURS);
  const fairness = clamp01(
    1 -
      usagePenalty +
      0.1 * (user?.recentDenials ?? 0) -
      OVERDUE_STRIKE_PENALTY * (user?.overdueStrikes ?? 0),
  );
  const feasibility =
    request.hoursNeeded > 0 ? Math.min(1, freeHoursBeforeDeadline / request.hoursNeeded) : 1;
  const priority =
    WEIGHTS.urgency * urgency + WEIGHTS.fairness * fairness + WEIGHTS.feasibility * feasibility;
  return {
    urgency: round3(urgency),
    fairness: round3(fairness),
    feasibility: round3(feasibility),
    priority: round3(priority),
  };
}

export function allocate(input: AllocationInput): AllocationResult[] {
  const { requests, equipment, bookings, users, now } = input;
  const taken = occupiedSlots(bookings);
  const weekly = weeklyHours(bookings, now);

  // Hours each student is already busy, so we never double-book a person.
  const studentBusy = new Set<string>();
  for (const b of bookings) {
    for (let h = b.startHour; h < b.endHour; h++) studentBusy.add(`${b.userId}|${b.date}|${h}`);
  }

  const scored = requests.map((request) => {
    const units = candidateUnits(request, equipment);
    const freeHours = units.reduce(
      (sum, u) => sum + freeSlots(u.id, taken, now, request.deadline).length,
      0,
    );
    const user = users.get(request.studentId);
    const hoursThisWeek = weekly.get(request.studentId) ?? 0;
    const score = scoreRequest(request, user, hoursThisWeek, freeHours, now);
    return { request, units, user, hoursThisWeek, score };
  });

  scored.sort(
    (a, b) =>
      b.score.priority - a.score.priority ||
      a.request.submittedAt.localeCompare(b.request.submittedAt) ||
      a.request.id.localeCompare(b.request.id),
  );

  return scored.map(({ request, units, user, hoursThisWeek, score }) => {
    const granted: Slot[] = [];
    for (const unit of units) {
      if (granted.length >= request.hoursNeeded) break;
      for (const slot of freeSlots(unit.id, taken, now, request.deadline)) {
        if (granted.length >= request.hoursNeeded) break;
        const personKey = `${request.studentId}|${slot.date}|${slot.hour}`;
        if (studentBusy.has(personKey)) continue;
        granted.push(slot);
        taken.add(slotKey(slot.equipmentId, slot.date, slot.hour));
        studentBusy.add(personKey);
      }
    }

    const reasons: ReasonCode[] = [];
    if (daysBetween(now.date, request.deadline) <= 3) reasons.push('URGENT_DEADLINE');
    if ((user?.recentDenials ?? 0) > 0) reasons.push('FAIRNESS_PRIORITY');
    if (hoursThisWeek >= WEEKLY_FAIR_SHARE_HOURS * 0.8) reasons.push('HEAVY_RECENT_USAGE');
    if ((user?.overdueStrikes ?? 0) > 0) reasons.push('OVERDUE_HISTORY');
    if (granted.some((s) => s.equipmentId !== request.equipmentId))
      reasons.push('MOVED_TO_EQUIVALENT');
    const hoursGranted = granted.length;
    reasons.push(hoursGranted >= request.hoursNeeded ? 'FULLY_ALLOCATED' : 'INSUFFICIENT_CAPACITY');

    return {
      requestId: request.id,
      studentId: request.studentId,
      priority: score.priority,
      outcome:
        hoursGranted >= request.hoursNeeded
          ? 'allocated'
          : hoursGranted > 0
            ? 'partial'
            : 'waitlisted',
      hoursGranted,
      hoursNeeded: request.hoursNeeded,
      slots: granted,
      reasons,
    } satisfies AllocationResult;
  });
}
