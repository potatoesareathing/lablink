import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../middleware/errors.js';
import { SESSION_COOKIE, setSessionCookie } from '../middleware/session.js';
import { LoginBody } from './schemas.js';

/**
 * Demo sign-in: judges pick a seeded persona. Identity is carried in an HMAC-signed,
 * HttpOnly, SameSite=Strict cookie, so it cannot be forged from the client.
 */
export function sessionRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get('/users', (_req, res) => {
    const users = [...deps.store.users.values()].map(({ id, name, role, departmentId }) => ({
      id,
      name,
      role,
      department: deps.store.departments.get(departmentId)?.name ?? '',
    }));
    res.json({ users });
  });

  r.get('/', (req, res) => {
    res.json({ user: req.user ?? null, aiEnabled: deps.assistant.enabled });
  });

  r.post('/', (req, res) => {
    const { userId } = parse(LoginBody, req.body);
    const user = deps.store.users.get(userId);
    if (!user) throw notFound('User');
    setSessionCookie(res, user.id, deps.sessionSecret, deps.secureCookies);
    res.json({ user, aiEnabled: deps.assistant.enabled });
  });

  r.delete('/', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  return r;
}
