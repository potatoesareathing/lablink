import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { requireRole } from '../middleware/session.js';
import { utilisationReport } from '../services/stats.js';

/** Campus utilisation dashboard (faculty). */
export function statsRoutes(deps: AppDeps): Router {
  const r = Router();
  r.get('/utilisation', (req, res) => {
    requireRole(req, 'faculty');
    res.json(utilisationReport(deps.store, deps.clock()));
  });
  return r;
}
