import path from 'node:path';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { AppDeps } from './deps.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { sessionMiddleware, requireRole } from './middleware/session.js';
import { aiRoutes } from './routes/ai.js';
import { allocationRoutes } from './routes/allocations.js';
import { bookingRoutes } from './routes/bookings.js';
import { equipmentRoutes } from './routes/equipment.js';
import { requestRoutes } from './routes/requests.js';
import { sessionRoutes } from './routes/session.js';
import { notificationRoutes, trackingRoutes } from './routes/tracking.js';
import { utilisationReport } from './services/stats.js';

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind one Google front-end proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ai: deps.assistant.enabled });
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Too many AI requests - please wait a minute.' },
    },
  });

  app.use('/api', apiLimiter, sessionMiddleware(deps.store, deps.sessionSecret));
  app.use('/api/session', sessionRoutes(deps));
  app.use('/api/equipment', equipmentRoutes(deps));
  app.use('/api/bookings', bookingRoutes(deps));
  app.use('/api/requests', requestRoutes(deps));
  app.use('/api/allocations', allocationRoutes(deps));
  app.use('/api/tracking', trackingRoutes(deps));
  app.use('/api/notifications', notificationRoutes(deps));
  app.use('/api/ai', aiLimiter, aiRoutes(deps));
  app.get('/api/stats/utilisation', (req, res) => {
    requireRole(req, 'faculty');
    res.json(utilisationReport(deps.store, deps.clock()));
  });
  app.use('/api', notFoundHandler);

  if (deps.clientDir) {
    const dir = path.resolve(deps.clientDir);
    app.use('/assets', express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dir, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
