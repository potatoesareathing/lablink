/**
 * Deterministic fallbacks used whenever the model is disabled, slow, or returns
 * something unusable. They keep every AI-assisted feature fully functional.
 */
import type { AllocationResult, EquipmentView, ReasonCode } from '../../../shared/types.js';
import { keywordSearch } from '../services/catalog.js';
import type { RequestDraft } from './schemas.js';
import type { PlanContext, PlanExplanation, RequestSummaryContext } from './types.js';

const DEFAULT_DRAFT_HOURS = 4;

const REASON_TEXT: Record<ReasonCode, string> = {
  URGENT_DEADLINE: 'the deadline is very close',
  FAIRNESS_PRIORITY: 'a previous request was not granted, so fairness priority was raised',
  HEAVY_RECENT_USAGE: 'heavy usage this week lowered priority to share time fairly',
  MOVED_TO_EQUIVALENT: 'part of the time is on an identical unit in another lab',
  INSUFFICIENT_CAPACITY: 'there is not enough free capacity before the deadline',
  FULLY_ALLOCATED: 'all requested hours fit before the deadline',
  OVERDUE_HISTORY: 'a previous late return slightly lowered priority',
};

const OUTCOME_TEXT: Record<AllocationResult['outcome'], (r: AllocationResult) => string> = {
  allocated: (r) => `receives all ${r.hoursNeeded} h`,
  partial: (r) => `receives ${r.hoursGranted} of ${r.hoursNeeded} h`,
  waitlisted: () => 'is waitlisted',
};

export function templateExplanation(r: AllocationResult, studentName: string): string {
  const because = r.reasons.map((c) => REASON_TEXT[c]).join('; ');
  return `${studentName} ${OUTCOME_TEXT[r.outcome](r)} because ${because}.`;
}

export function templatePlan(items: PlanContext[]): PlanExplanation {
  const allocated = items.filter((i) => i.result.outcome === 'allocated').length;
  return {
    summary:
      `${allocated} of ${items.length} requests fully allocated, ordered by deadline urgency, ` +
      'fairness and feasibility. No overlapping bookings were created.',
    explanations: new Map(
      items.map((i) => [i.result.requestId, templateExplanation(i.result, i.studentName)]),
    ),
    source: 'template',
  };
}

export function templateSummary(ctx: RequestSummaryContext): string {
  const need = `${ctx.studentName} needs ${ctx.hoursNeeded} h on ${ctx.equipmentName} by ${ctx.deadline}. `;
  return ctx.freeHours >= ctx.hoursNeeded
    ? `${need}${ctx.freeHours} h are free before the deadline, so the request is feasible.`
    : `${need}Only ${ctx.freeHours} h are free before the deadline; consider a partial approval or an alternative unit.`;
}

/** Keyword-matched equipment plus an editable title/description from the idea text. */
export function heuristicDraft(idea: string, catalog: EquipmentView[]): RequestDraft {
  const best = keywordSearch(
    catalog.filter((e) => e.status === 'available'),
    idea,
    1,
  )[0];
  const title = idea.split(' ').slice(0, 6).join(' ');
  return {
    projectTitle: title.length >= 3 ? title : 'New lab project',
    description: idea.length >= 10 ? idea : `${idea} - project details to be added.`,
    equipmentId: best?.equipment.id ?? catalog[0]?.id ?? '',
    hoursNeeded: DEFAULT_DRAFT_HOURS,
    rationale: best
      ? `Suggested by keyword match (${best.reason.toLowerCase()}).`
      : 'Pick equipment manually.',
    source: 'heuristic',
  };
}
