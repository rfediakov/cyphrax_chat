import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectMongo } from './lib/mongo.js';
import { redis } from './lib/redis.js';
import { AppError } from './lib/errors.js';
import authRoutes from './routes/auth.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import usersRoutes from './routes/users.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import roomsRoutes from './routes/rooms.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import dialogsRoutes from './routes/dialogs.routes.js';
import attachmentsRoutes from './routes/attachments.routes.js';

const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Chat API running' });
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

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});

export { app };
