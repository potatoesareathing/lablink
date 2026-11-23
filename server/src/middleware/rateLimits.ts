import rateLimit from 'express-rate-limit';

const FIFTEEN_MINUTES = 15 * 60_000;
const ONE_MINUTE = 60_000;

/** General API budget per client IP. */
export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

/** Tighter budget for endpoints that call the language model. */
export const aiLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { code: 'rate_limited', message: 'Too many AI requests - please wait a minute.' },
  },
});
