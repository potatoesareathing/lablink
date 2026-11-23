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
  AllocationOutcome,
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
  bookings: readonly Booking[];
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
export function weeklyHours(bookings: readonly Booking[], now: CampusClock): Map<string, number> {
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

/** Fairness inputs for one request's student. */
export interface StudentContext {
  user: User | undefined;
  hoursThisWeek: number;
  /** Free hours before the deadline across the requested unit and its equivalents. */
  freeHours: number;
}

export function scoreRequest(
  request: AccessRequest,
  { user, hoursThisWeek, freeHours }: StudentContext,
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
  const feasibility = request.hoursNeeded > 0 ? Math.min(1, freeHours / request.hoursNeeded) : 1;
  const priority =
    WEIGHTS.urgency * urgency + WEIGHTS.fairness * fairness + WEIGHTS.feasibility * feasibility;
  return {
    urgency: round3(urgency),
    fairness: round3(fairness),
    feasibility: round3(feasibility),
    priority: round3(priority),
  };
}

interface ScoredRequest {
  request: AccessRequest;
  units: Equipment[];
  user: User | undefined;
  hoursThisWeek: number;
  priority: number;
}

/** Mutable allocation state: occupied unit-hours and busy student-hours. */
interface Ledger {
  taken: Set<string>;
  studentBusy: Set<string>;
}

const personKey = (userId: string, date: string, hour: number) => `${userId}|${date}|${hour}`;

function createLedger(bookings: readonly Booking[]): Ledger {
  const studentBusy = new Set<string>();
  for (const b of bookings) {
    for (let h = b.startHour; h < b.endHour; h++) studentBusy.add(personKey(b.userId, b.date, h));
  }
  return { taken: occupiedSlots(bookings), studentBusy };
}

/** Scores every request and orders them by priority, then submission time, then id. */
function rankRequests(input: AllocationInput, ledger: Ledger): ScoredRequest[] {
  const weekly = weeklyHours(input.bookings, input.now);
  return input.requests
    .map((request) => {
      const units = candidateUnits(request, input.equipment);
      const freeHours = units.reduce(
        (sum, u) => sum + freeSlots(u.id, ledger.taken, input.now, request.deadline).length,
        0,
      );
      const user = input.users.get(request.studentId);
      const hoursThisWeek = weekly.get(request.studentId) ?? 0;
      const { priority } = scoreRequest(request, { user, hoursThisWeek, freeHours }, input.now);
      return { request, units, user, hoursThisWeek, priority };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.request.submittedAt.localeCompare(b.request.submittedAt) ||
        a.request.id.localeCompare(b.request.id),
    );
}

/** Takes the earliest free hours before the deadline, requested unit first. */
function grantSlots(entry: ScoredRequest, ledger: Ledger, now: CampusClock): Slot[] {
  const { request, units } = entry;
  const granted: Slot[] = [];
  for (const unit of units) {
    const free = freeSlots(unit.id, ledger.taken, now, request.deadline);
    for (const slot of free) {
      if (granted.length >= request.hoursNeeded) return granted;
      const person = personKey(request.studentId, slot.date, slot.hour);
      if (ledger.studentBusy.has(person)) continue;
      granted.push(slot);
      ledger.taken.add(slotKey(slot.equipmentId, slot.date, slot.hour));
      ledger.studentBusy.add(person);
    }
  }
  return granted;
}

function reasonsFor(entry: ScoredRequest, granted: Slot[], now: CampusClock): ReasonCode[] {
  const { request, user, hoursThisWeek } = entry;
  const checks: [boolean, ReasonCode][] = [
    [daysBetween(now.date, request.deadline) <= 3, 'URGENT_DEADLINE'],
    [(user?.recentDenials ?? 0) > 0, 'FAIRNESS_PRIORITY'],
    [hoursThisWeek >= WEEKLY_FAIR_SHARE_HOURS * 0.8, 'HEAVY_RECENT_USAGE'],
    [(user?.overdueStrikes ?? 0) > 0, 'OVERDUE_HISTORY'],
    [granted.some((s) => s.equipmentId !== request.equipmentId), 'MOVED_TO_EQUIVALENT'],
  ];
  const reasons = checks.filter(([applies]) => applies).map(([, code]) => code);
  const complete = granted.length >= request.hoursNeeded;
  return [...reasons, complete ? 'FULLY_ALLOCATED' : 'INSUFFICIENT_CAPACITY'];
}

function outcomeOf(hoursGranted: number, hoursNeeded: number): AllocationOutcome {
  if (hoursGranted >= hoursNeeded) return 'allocated';
  return hoursGranted > 0 ? 'partial' : 'waitlisted';
}

export function allocate(input: AllocationInput): AllocationResult[] {
  const ledger = createLedger(input.bookings);
  return rankRequests(input, ledger).map((entry) => {
    const slots = grantSlots(entry, ledger, input.now);
    return {
      requestId: entry.request.id,
      studentId: entry.request.studentId,
      priority: entry.priority,
      outcome: outcomeOf(slots.length, entry.request.hoursNeeded),
      hoursGranted: slots.length,
      hoursNeeded: entry.request.hoursNeeded,
      slots,
      reasons: reasonsFor(entry, slots, input.now),
    };
  });
}
