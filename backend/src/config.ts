import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  mongodbUri: requireEnv('MONGODB_URI'),
  redisUrl: requireEnv('REDIS_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: '15m',
  jwtRefreshExpiresInDays: 30,
  bcryptSaltRounds: 12,
  uploadDir: optionalEnv('UPLOAD_DIR', '/uploads'),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),
  // Web Push (VAPID) — generate keys with: npx web-push generate-vapid-keys
  vapidPublicKey: optionalEnv('VAPID_PUBLIC_KEY', ''),
  vapidPrivateKey: optionalEnv('VAPID_PRIVATE_KEY', ''),
  vapidContact: optionalEnv('VAPID_CONTACT', 'mailto:admin@example.com'),
} as const;
