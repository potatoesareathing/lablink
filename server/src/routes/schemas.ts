import { z } from 'zod';
import { CLOSE_HOUR, MAX_BOOKING_HOURS, OPEN_HOUR } from '../../../shared/constants.js';
import { isValidDate } from '../lib/time.js';

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/i, 'Invalid id');
const date = z.string().refine(isValidDate, 'Use YYYY-MM-DD');
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const LoginBody = z.object({ userId: id });

export const CatalogQuery = z.object({
  q: z.string().trim().max(100).optional(),
  department: id.optional(),
  category: z.string().trim().max(60).optional(),
  available: z.enum(['true', 'false']).optional(),
});

export const IdParams = z.object({ id });

export const AvailabilityQuery = z.object({
  from: date.optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});

export const BookingBody = z
  .object({
    equipmentId: id,
    date,
    startHour: z
      .number()
      .int()
      .min(OPEN_HOUR)
      .max(CLOSE_HOUR - 1),
    hours: z.number().int().min(1).max(MAX_BOOKING_HOURS),
  })
  .refine((b) => b.startHour + b.hours <= CLOSE_HOUR, {
    message: `Bookings must end by ${CLOSE_HOUR}:00`,
    path: ['hours'],
  });

export const RequestBody = z.object({
  projectTitle: text(3, 100),
  description: text(10, 1000),
  deadline: date,
  hoursNeeded: z.number().int().min(1).max(40),
  equipmentId: id,
});

export const DecisionBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), note: text(0, 300).optional() }),
  z.object({ decision: z.literal('reject'), note: text(3, 300) }),
]);

export const RequestIdsBody = z.object({
  requestIds: z.array(id).min(1).max(20),
  note: text(0, 300).optional(),
});

export const SearchBody = z.object({ query: text(2, 300) });
export const DraftBody = z.object({ idea: text(10, 800) });
