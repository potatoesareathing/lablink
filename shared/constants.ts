/** Labs are bookable from OPEN_HOUR (inclusive) to CLOSE_HOUR (exclusive), in 1-hour slots. */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 17;
export const HOURS_PER_DAY = CLOSE_HOUR - OPEN_HOUR;

/** Maximum hours a single booking may span. */
export const MAX_BOOKING_HOURS = 4;

/** Weekly hours after which a student's fairness priority starts to drop. */
export const WEEKLY_FAIR_SHARE_HOURS = 10;

/** How far ahead (days) students can book and the allocator will search. */
export const BOOKING_HORIZON_DAYS = 21;

/** Late-return fine: per started hour past the booking end, capped. Amounts in INR. */
export const FINE_PER_HOUR = 50;
export const FINE_CAP = 500;

/** Fairness penalty per late return on record. */
export const OVERDUE_STRIKE_PENALTY = 0.15;

/**
 * Demo-only UPI payee. The "@invalid" handle belongs to no bank, so the QR can never
 * move real money. Replace via configuration with an institutional UPI ID in production.
 */
export const DEMO_UPI_VPA = 'lablink-demo@invalid';
