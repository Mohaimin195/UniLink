import type Database from 'better-sqlite3';
import express from 'express';
import { createAdminRouter } from './routes/adminRoutes.ts';
import { createAuthRouter } from './routes/authRoutes.ts';
import { createJobRouter } from './routes/jobRoutes.ts';
import { createMessagingRouter } from './routes/messagingRoutes.ts';
import { createProfileRouter } from './routes/profileRoutes.ts';
import { createRequestRouter } from './routes/requestRoutes.ts';
import { createSafetyRouter } from './routes/safetyRoutes.ts';

export function createApiApp(db: Database.Database) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'UniLink' });
  });

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api', createProfileRouter(db));
  app.use('/api', createRequestRouter(db));
  app.use('/api', createJobRouter(db));
  app.use('/api', createMessagingRouter(db));
  app.use('/api', createSafetyRouter(db));
  app.use('/api/admin', createAdminRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled API error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
