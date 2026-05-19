import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectMongo } from './lib/mongo.js';
import { redis } from './lib/redis.js';
import { AppError } from './lib/errors.js';
import { initSocket } from './socket/index.js';
import authRoutes from './routes/auth.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import usersRoutes from './routes/users.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import roomsRoutes from './routes/rooms.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import dialogsRoutes from './routes/dialogs.routes.js';
import attachmentsRoutes from './routes/attachments.routes.js';
import presenceRoutes from './routes/presence.routes.js';
import pushRoutes from './routes/push.routes.js';
import syncRoutes from './routes/sync.routes.js';
import locationRoutes from './routes/location.routes.js';
import telemetryRoutes from './routes/telemetry.routes.js';
import callsRoutes from './routes/calls.routes.js';
import sosRoutes from './routes/sos.routes.js';
import privacyRoutes from './routes/privacy.routes.js';
import markersRoutes from './routes/markers.routes.js';

const PKG = (() => {
  try {
    // __dirname resolves to dist/ at runtime (compiled CJS); package.json sits one level up.
    const pkgPath = resolve(__dirname, '..', 'package.json');
    const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string };
    return { name: raw.name ?? 'safegroup-api', version: raw.version ?? '0.0.0' };
  } catch {
    return { name: 'safegroup-api', version: '0.0.0' };
  }
})();

const app = express();

app.set('trust proxy', 1);

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Chat API running', name: PKG.name, version: PKG.version });
});

// `/version` is exposed under /api/v1 so it goes through the same reverse-proxy
// rule as the rest of the public API (Caddy routes /api/* to the backend).
app.get('/api/v1/version', (_req, res) => {
  res.json({ name: PKG.name, version: PKG.version });
});

// API v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/sessions', sessionsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/contacts', contactsRoutes);
app.use('/api/v1/rooms', roomsRoutes);
// Mount room message routes as sub-routes with mergeParams
app.use('/api/v1/rooms/:id/messages', messagesRoutes);
app.use('/api/v1/dialogs', dialogsRoutes);
app.use('/api/v1/attachments', attachmentsRoutes);
app.use('/api/v1/presence', presenceRoutes);
app.use('/api/v1/push', pushRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/telemetry', telemetryRoutes);
app.use('/api/v1/calls', callsRoutes);
app.use('/api/v1/sos', sosRoutes);
app.use('/api/v1/privacy', privacyRoutes);
app.use('/api/v1/markers', markersRoutes);

// Global error handler — must be registered after all routes
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrap() {
  await connectMongo();

  // Trigger Redis connection eagerly so startup logs are visible
  await redis.ping();
  console.log('[Redis] Ping OK');

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});

export { app };
