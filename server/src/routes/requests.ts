import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { forbidden, notFound } from '../lib/errors.js';
import { parse } from '../middleware/errors.js';
import { requireRole, requireUser } from '../middleware/session.js';
import {
  applyAllocation,
  createRequest,
  listRequests,
  planAllocation,
  rejectRequest,
  toView,
} from '../services/requests.js';
import { buildPlan } from './allocations.js';
import { DecisionBody, IdParams, RequestBody } from './schemas.js';

export function requestRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const user = requireUser(req);
    res.json({ requests: listRequests(deps.store, user, deps.clock()) });
  });

  r.post('/', (req, res) => {
    const student = requireRole(req, 'student');
    const body = parse(RequestBody, req.body);
    const request = createRequest(deps.store, student, body, deps.clock());
    res.status(201).json({ request: toView(deps.store, request, deps.clock()) });
  });

  /** AI summary for faculty; risks are deterministic and always included. */
  r.post('/:id/summary', async (req, res) => {
    requireRole(req, 'faculty');
    const { id } = parse(IdParams, req.params);
    const request = deps.store.requests.get(id);
    if (!request) throw notFound('Request');
    const view = toView(deps.store, request, deps.clock());
    const { summary, source } = await deps.assistant.summarizeRequest({
      projectTitle: view.projectTitle,
      description: view.description,
      studentName: view.studentName,
      equipmentName: view.equipmentName,
      hoursNeeded: view.hoursNeeded,
      deadline: view.deadline,
      freeHours: view.freeHoursBeforeDeadline,
      risks: view.risks,
    });
    res.json({ summary, source, risks: view.risks });
  });

  /** Approve (auto-schedules via the fair allocator) or reject with a reason. */
  r.post('/:id/decision', async (req, res) => {
    requireRole(req, 'faculty');
    const { id } = parse(IdParams, req.params);
    const body = parse(DecisionBody, req.body);
    const now = deps.clock();
    if (!deps.store.requests.has(id)) throw notFound('Request');
    if (body.decision === 'reject') {
      const request = rejectRequest(deps.store, id, body.note);
      res.json({ request: toView(deps.store, request, now) });
      return;
    }
    const results = planAllocation(deps.store, [id], now);
    applyAllocation(deps.store, results, body.note);
    const plan = await buildPlan(deps, results);
    res.json({ request: toView(deps.store, deps.store.requests.get(id)!, now), plan });
  });

  r.get('/:id', (req, res) => {
    const user = requireUser(req);
    const { id } = parse(IdParams, req.params);
    const request = deps.store.requests.get(id);
    if (!request) throw notFound('Request');
    if (user.role !== 'faculty' && request.studentId !== user.id) throw forbidden();
    res.json({ request: toView(deps.store, request, deps.clock()) });
  });

  return r;
}
