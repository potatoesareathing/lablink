import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';

/** Parses untrusted input with a zod schema, throwing a 400 with field-level details. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(
      400,
      'invalid_input',
      'Some fields are missing or invalid',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

/** Central error handler: never leaks stack traces or internal messages to clients. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  const status = (err as { status?: number })?.status;
  if (status === 400 || status === 413) {
    res
      .status(status)
      .json({ error: { code: 'bad_request', message: 'Malformed or oversized request' } });
    return;
  }
  console.error('[error]', err instanceof Error ? err.message : err);
  res
    .status(500)
    .json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
}
