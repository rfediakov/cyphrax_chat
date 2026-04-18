import mongoose from 'mongoose';
import { config } from '../config.js';

export async function connectMongo(): Promise<void> {
  const autoIndex = config.nodeEnv !== 'production';

  mongoose.connection.on('connected', () => console.log('[MongoDB] Connected'));
  mongoose.connection.on('error', (err: Error) => console.error('[MongoDB] Error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Disconnected'));

  await mongoose.connect(config.mongodbUri, { autoIndex });
  console.log(`[MongoDB] Ready (autoIndex: ${autoIndex})`);
}
