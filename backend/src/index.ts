import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectMongo } from './lib/mongo.js';
import { redis } from './lib/redis.js';
import { AppError } from './lib/errors.js';

const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Chat API running' });
});

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
