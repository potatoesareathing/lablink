import { Router } from 'express';
import { BOOKING_HORIZON_DAYS } from '../../../shared/constants.js';
import type { AppDeps } from '../deps.js';
import { addDays } from '../lib/time.js';
import { parse } from '../middleware/errors.js';
import { requireUser } from '../middleware/session.js';
import { createBooking } from '../services/booking.js';
import { BookingBody } from './schemas.js';

export function bookingRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get('/mine', (req, res) => {
    const user = requireUser(req);
    const today = deps.clock().date;
    const bookings = deps.store
      .allBookings()
      .filter((b) => b.userId === user.id && b.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour)
      .map((b) => {
        const e = deps.store.equipment.get(b.equipmentId);
        return { ...b, equipment: e ? deps.store.equipmentView(e) : null };
      });
    res.json({ bookings });
  });

  r.post('/', (req, res) => {
    const user = requireUser(req);
    const body = parse(BookingBody, req.body);
    const now = deps.clock();
    const outcome = createBooking(
      deps.store,
      user.id,
      body,
      now,
      addDays(now.date, BOOKING_HORIZON_DAYS),
    );
    if (outcome.ok) {
      res.status(201).json({ booking: outcome.booking });
    } else {
      res.status(409).json({
        error: { code: 'conflict', message: 'That slot is already booked' },
        alternatives: outcome.alternatives,
      });
    }
  });

  return r;
}
