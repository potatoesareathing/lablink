import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role, User } from '../../../shared/types.js';
import type { Store } from '../data/store.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'lablink_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

const sign = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export function encodeSession(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** Returns the user id if the token's HMAC signature is valid. */
export function decodeSession(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Attaches `req.user` when a valid signed session cookie is present. */
export function sessionMiddleware(store: Store, secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userId = decodeSession(readCookie(req.headers.cookie, SESSION_COOKIE), secret);
    const user = userId ? store.users.get(userId) : undefined;
    if (user) req.user = user;
    next();
  };
}

export function requireUser(req: Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireRole(req: Request, role: Role): User {
  const user = requireUser(req);
  if (user.role !== role) throw forbidden();
  return user;
}

export function setSessionCookie(res: Response, userId: string, secret: string, secure: boolean) {
  res.cookie(SESSION_COOKIE, encodeSession(userId, secret), {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}
