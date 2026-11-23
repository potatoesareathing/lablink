import { Router } from 'express';
import type { AllocationResult } from '../../../shared/types.js';
import type { AppDeps } from '../deps.js';
import { parse } from '../middleware/errors.js';
import { requireRole } from '../middleware/session.js';
import { mergeSlots } from '../services/availability.js';
import { applyAllocation, findConflicts, planAllocation } from '../services/requests.js';
import { RequestIdsBody } from './schemas.js';

/** Enriches raw allocation results with names, merged time ranges and explanations. */
export async function buildPlan(deps: AppDeps, results: AllocationResult[]) {
  const { store } = deps;
  const contexts = results.map((result) => {
    const request = store.requests.get(result.requestId)!;
    const ranges = mergeSlots(result.slots).map((range) => {
      const e = store.equipment.get(range.equipmentId);
      return {
        ...range,
        equipmentName: e?.name ?? '',
        labName: e ? (store.labs.get(e.labId)?.name ?? '') : '',
      };
    });
    return {
      result,
      ranges,
      studentName: store.users.get(result.studentId)?.name ?? 'Student',
      projectTitle: request.projectTitle,
      deadline: request.deadline,
      equipmentNames: [...new Set(ranges.map((r) => `${r.equipmentName} (${r.labName})`))],
    };
  });
  const explained = await deps.assistant.explainPlan(contexts);
  return {
    generatedAt: new Date().toISOString(),
    summary: explained.summary,
    source: explained.source,
    results: contexts.map((c) => ({
      ...c.result,
      studentName: c.studentName,
      projectTitle: c.projectTitle,
      deadline: c.deadline,
      ranges: c.ranges,
      explanation: explained.explanations.get(c.result.requestId) ?? '',
    })),
  };
}

export function allocationRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get('/conflicts', (req, res) => {
    requireRole(req, 'faculty');
    res.json({ conflicts: findConflicts(deps.store, deps.clock()) });
  });

  /** Preview a fair allocation for competing requests. Nothing is committed. */
  r.post('/resolve', async (req, res) => {
    requireRole(req, 'faculty');
    const { requestIds } = parse(RequestIdsBody, req.body);
    const results = planAllocation(deps.store, [...new Set(requestIds)], deps.clock());
    res.json({ plan: await buildPlan(deps, results) });
  });

  /**
   * Commit the allocation. The plan is recomputed against current bookings so a stale
   * preview can never create overlapping bookings.
   */
  r.post('/apply', async (req, res) => {
    requireRole(req, 'faculty');
    const { requestIds, note } = parse(RequestIdsBody, req.body);
    const results = planAllocation(deps.store, [...new Set(requestIds)], deps.clock());
    applyAllocation(deps.store, results, note);
    res.json({ plan: await buildPlan(deps, results) });
  });

  return r;
}
