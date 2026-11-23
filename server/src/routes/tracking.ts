import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { parse } from '../middleware/errors.js';
import { requireRole, requireUser } from '../middleware/session.js';
import { notificationsFor } from '../services/notifications.js';
import { checkOut, deskView, payFine, returnItem, track } from '../services/tracking.js';
import { IdParams } from './schemas.js';

/** Equipment desk (faculty): hand-outs, returns, overdue items and fines. */
export function trackingRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get('/desk', (req, res) => {
    requireRole(req, 'faculty');
    res.json(deskView(deps.store, deps.clock()));
  });

  r.post('/:id/checkout', (req, res) => {
    requireRole(req, 'faculty');
    const { id } = parse(IdParams, req.params);
    const now = deps.clock();
    res.json({ booking: track(deps.store, checkOut(deps.store, id, now), now) });
  });

  r.post('/:id/return', (req, res) => {
    requireRole(req, 'faculty');
    const { id } = parse(IdParams, req.params);
    const now = deps.clock();
    res.json({ booking: track(deps.store, returnItem(deps.store, id, now), now) });
  });

  /** Demo settlement: the student confirms they paid their own fine. */
  r.post('/:id/pay-fine', (req, res) => {
    const user = requireRole(req, 'student');
    const { id } = parse(IdParams, req.params);
    const now = deps.clock();
    res.json({ booking: track(deps.store, payFine(deps.store, user, id), now) });
  });

  return r;
}

export function notificationRoutes(deps: AppDeps): Router {
  const r = Router();
  r.get('/', (req, res) => {
    const user = requireUser(req);
    res.json({ notifications: notificationsFor(deps.store, user, deps.clock()) });
  });
  return r;
}
