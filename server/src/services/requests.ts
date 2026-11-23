import type {
  AccessRequest,
  AllocationResult,
  RequestStatus,
  User,
} from '../../../shared/types.js';
import { Store } from '../data/store.js';
import { HttpError, notFound } from '../lib/errors.js';
import type { CampusClock } from '../lib/time.js';
import { daysBetween } from '../lib/time.js';
import { allocate, candidateUnits } from './allocation.js';
import { freeSlots, mergeSlots, occupiedSlots } from './availability.js';

export interface NewRequestInput {
  projectTitle: string;
  description: string;
  deadline: string;
  hoursNeeded: number;
  equipmentId: string;
}

export interface RequestView extends AccessRequest {
  studentName: string;
  equipmentName: string;
  equipmentGroup: string;
  labName: string;
  freeHoursBeforeDeadline: number;
  risks: string[];
}

const OUTCOME_STATUS: Record<AllocationResult['outcome'], RequestStatus> = {
  allocated: 'approved',
  partial: 'partial',
  waitlisted: 'waitlisted',
};

export function createRequest(
  store: Store,
  student: User,
  input: NewRequestInput,
  now: CampusClock,
): AccessRequest {
  if (!store.equipment.has(input.equipmentId)) throw notFound('Equipment');
  if (input.deadline < now.date) {
    throw new HttpError(400, 'deadline_past', 'The deadline must be today or later');
  }
  const request: AccessRequest = {
    id: Store.newId('req'),
    studentId: student.id,
    ...input,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
  store.requests.set(request.id, request);
  return request;
}

/** Deterministic risk flags shown to faculty; never depends on the AI. */
export function assessRisks(request: AccessRequest, freeHours: number, now: CampusClock): string[] {
  const risks: string[] = [];
  const daysLeft = daysBetween(now.date, request.deadline);
  if (daysLeft <= 3) risks.push(`Deadline in ${Math.max(0, daysLeft)} day(s)`);
  if (freeHours < request.hoursNeeded) {
    risks.push(
      `Needs ${request.hoursNeeded} h but only ${freeHours} h free before the deadline (incl. equivalent units)`,
    );
  }
  if (request.hoursNeeded >= 10) risks.push('Large time request - consider splitting across units');
  return risks;
}

/**
 * Enriches a request for display. Pass `taken` when building many views at once so the
 * occupied-slot set is computed once instead of per request.
 */
export function toView(
  store: Store,
  request: AccessRequest,
  now: CampusClock,
  taken: Set<string> = occupiedSlots(store.allBookings()),
): RequestView {
  const equipment = store.equipment.get(request.equipmentId);
  const lab = equipment ? store.labs.get(equipment.labId) : undefined;
  const freeHours = candidateUnits(request, [...store.equipment.values()]).reduce(
    (sum, u) => sum + freeSlots(u.id, taken, now, request.deadline).length,
    0,
  );
  return {
    ...request,
    studentName: store.users.get(request.studentId)?.name ?? 'Unknown student',
    equipmentName: equipment?.name ?? 'Unknown equipment',
    equipmentGroup: equipment?.equivalentGroup ?? '',
    labName: lab?.name ?? '',
    freeHoursBeforeDeadline: freeHours,
    risks: request.status === 'pending' ? assessRisks(request, freeHours, now) : [],
  };
}

export function listRequests(store: Store, user: User, now: CampusClock): RequestView[] {
  const all = [...store.requests.values()];
  const visible = user.role === 'faculty' ? all : all.filter((r) => r.studentId === user.id);
  const taken = occupiedSlots(store.allBookings());
  return visible
    .sort(
      (a, b) => a.deadline.localeCompare(b.deadline) || a.submittedAt.localeCompare(b.submittedAt),
    )
    .map((r) => toView(store, r, now, taken));
}

/** Runs the allocator for the given pending requests without committing anything. */
export function planAllocation(
  store: Store,
  requestIds: string[],
  now: CampusClock,
): AllocationResult[] {
  const requests = requestIds.map((id) => {
    const r = store.requests.get(id);
    if (!r) throw notFound(`Request ${id}`);
    if (r.status !== 'pending') {
      throw new HttpError(
        409,
        'not_pending',
        `Request "${r.projectTitle}" has already been decided`,
      );
    }
    return r;
  });
  return allocate({
    requests,
    equipment: [...store.equipment.values()],
    bookings: store.allBookings(),
    users: store.users,
    now,
  });
}

/** Commits an allocation: creates bookings and updates request statuses. */
export function applyAllocation(store: Store, results: AllocationResult[], note?: string): void {
  for (const result of results) {
    const request = store.requests.get(result.requestId);
    if (!request) continue;
    for (const range of mergeSlots(result.slots)) {
      store.addBooking({
        id: Store.newId('bk'),
        userId: request.studentId,
        requestId: request.id,
        ...range,
      });
    }
    request.status = OUTCOME_STATUS[result.outcome];
    if (note) request.facultyNote = note;
    if (result.outcome === 'waitlisted') {
      const student = store.users.get(request.studentId);
      if (student) student.recentDenials += 1;
    }
  }
}

export function rejectRequest(store: Store, requestId: string, note: string): AccessRequest {
  const request = store.requests.get(requestId);
  if (!request) throw notFound('Request');
  if (request.status !== 'pending') {
    throw new HttpError(409, 'not_pending', 'This request has already been decided');
  }
  request.status = 'rejected';
  request.facultyNote = note;
  const student = store.users.get(request.studentId);
  if (student) student.recentDenials += 1;
  return request;
}

export interface ConflictGroup {
  equivalentGroup: string;
  category: string;
  requestIds: string[];
  hoursDemanded: number;
  freeHours: number;
}

/** Equipment groups where two or more pending requests compete for capacity. */
export function findConflicts(store: Store, now: CampusClock): ConflictGroup[] {
  const pending = [...store.requests.values()].filter((r) => r.status === 'pending');
  const byGroup = new Map<string, AccessRequest[]>();
  for (const r of pending) {
    const group = store.equipment.get(r.equipmentId)?.equivalentGroup;
    if (!group) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), r]);
  }
  const taken = occupiedSlots(store.allBookings());
  const groups: ConflictGroup[] = [];
  for (const [group, reqs] of byGroup) {
    if (reqs.length < 2) continue;
    const latest = reqs.reduce((d, r) => (r.deadline > d ? r.deadline : d), now.date);
    const units = [...store.equipment.values()].filter(
      (e) => e.equivalentGroup === group && e.status === 'available',
    );
    const freeHours = units.reduce((s, u) => s + freeSlots(u.id, taken, now, latest).length, 0);
    groups.push({
      equivalentGroup: group,
      category: units[0]?.category ?? store.equipment.get(reqs[0]!.equipmentId)?.category ?? group,
      requestIds: reqs.map((r) => r.id),
      hoursDemanded: reqs.reduce((s, r) => s + r.hoursNeeded, 0),
      freeHours,
    });
  }
  return groups;
}
