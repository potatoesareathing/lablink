import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import type { AppDeps } from './deps.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { aiLimiter, apiLimiter } from './middleware/rateLimits.js';
import { sessionMiddleware } from './middleware/session.js';
import { aiRoutes } from './routes/ai.js';
import { allocationRoutes } from './routes/allocations.js';
import { bookingRoutes } from './routes/bookings.js';
import { equipmentRoutes } from './routes/equipment.js';
import { requestRoutes } from './routes/requests.js';
import { sessionRoutes } from './routes/session.js';
import { statsRoutes } from './routes/stats.js';
import { notificationRoutes, trackingRoutes } from './routes/tracking.js';

/** Maximum accepted JSON body; larger payloads get 413. */
const JSON_BODY_LIMIT = '20kb';

/** Builds the Express app: security middleware, API routes, then the static client. */
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
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ai: deps.assistant.enabled });
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
  app.use('/api/stats', statsRoutes(deps));
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
