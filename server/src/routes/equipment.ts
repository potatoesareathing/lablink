import { Router } from 'express';
import { BOOKING_HORIZON_DAYS } from '../../../shared/constants.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../lib/errors.js';
import { addDays } from '../lib/time.js';
import { parse } from '../middleware/errors.js';
import { requireUser } from '../middleware/session.js';
import { availabilityGrid } from '../services/booking.js';
import { filterCatalog, keywordSearch } from '../services/catalog.js';
import { AvailabilityQuery, CatalogQuery, IdParams } from './schemas.js';

export function equipmentRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get('/', (req, res) => {
    requireUser(req);
    const q = parse(CatalogQuery, req.query);
    const filtered = filterCatalog(deps.store.catalog(), {
      departmentId: q.department,
      category: q.category,
      availableOnly: q.available === 'true',
    });
    const items = q.q ? keywordSearch(filtered, q.q, 50).map((m) => m.equipment) : filtered;
    const categories = [...new Set(deps.store.catalog().map((e) => e.category))].sort();
    const departments = [...deps.store.departments.values()];
    res.json({ items, categories, departments });
  });

  r.get('/:id/availability', (req, res) => {
    requireUser(req);
    const { id } = parse(IdParams, req.params);
    const q = parse(AvailabilityQuery, req.query);
    const equipment = deps.store.equipment.get(id);
    if (!equipment) throw notFound('Equipment');
    const now = deps.clock();
    const from = q.from && q.from >= now.date ? q.from : now.date;
    const horizonEnd = addDays(now.date, BOOKING_HORIZON_DAYS);
    const toCandidate = addDays(from, q.days - 1);
    const to = toCandidate > horizonEnd ? horizonEnd : toCandidate;
    res.json({
      equipment: deps.store.equipmentView(equipment),
      now,
      days: availabilityGrid(deps.store, id, from, to),
    });
  });

  return r;
}
