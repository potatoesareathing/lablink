import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { parse } from '../middleware/errors.js';
import { requireUser } from '../middleware/session.js';
import { DraftBody, SearchBody } from './schemas.js';

export function aiRoutes(deps: AppDeps): Router {
  const r = Router();

  r.post('/search', async (req, res) => {
    requireUser(req);
    const { query } = parse(SearchBody, req.body);
    res.json(await deps.assistant.searchEquipment(query, deps.store.catalog()));
  });

  r.post('/draft-request', async (req, res) => {
    requireUser(req);
    const { idea } = parse(DraftBody, req.body);
    res.json({ draft: await deps.assistant.draftRequest(idea, deps.store.catalog()) });
  });

  return r;
}
