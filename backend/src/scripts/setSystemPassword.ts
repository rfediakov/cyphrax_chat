/**
 * Set / reset the password for the seeded "system" user that owns the default
 * typed rooms (Radio Enthusiasts, FM Radio Lounge, Music Jukebox, …).
 *
 * The system user is created by `seedDefaultRooms.ts` with a sentinel password
 * hash that no `bcrypt.compare` call can ever match. This script swaps that
 * sentinel for a real bcrypt hash so you can sign in with:
 *
 *   email:    system@safegroup.local
 *   password: <whatever you pass in>
 *
 * Run with:
 *
 *   cd backend
 *   SYSTEM_PASSWORD='your-strong-password' npx ts-node src/scripts/setSystemPassword.ts
 *   # or:
 *   npx ts-node src/scripts/setSystemPassword.ts your-strong-password
 *
 * Once you're done managing rooms, you can rotate the password again by
 * re-running this script with a fresh value, or wipe it back to a sentinel
 * with: npx ts-node src/scripts/setSystemPassword.ts --lock
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { User } from '../models/user.model.js';

const SENTINEL_HASH = 'no-login:safegroup-system-bot-non-loginable-sentinel-hash________';

async function main(): Promise<void> {
  const lock = process.argv.includes('--lock');
  const rawPassword =
    process.env.SYSTEM_PASSWORD ?? process.argv.find((a) => !a.startsWith('--') && !a.endsWith('.ts'));

  if (!lock && (!rawPassword || rawPassword.length < 8)) {
    console.error(
      'Usage:\n' +
        '  SYSTEM_PASSWORD=<password>  npx ts-node src/scripts/setSystemPassword.ts\n' +
        '  npx ts-node src/scripts/setSystemPassword.ts <password>\n' +
        '  npx ts-node src/scripts/setSystemPassword.ts --lock  # restore non-loginable sentinel\n' +
        '\nPassword must be at least 8 characters.',
    );
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUri);
  try {
    const user = await User.findOne({ username: 'system' });
    if (!user) {
      console.error('[setSystemPassword] No system user found. Run seedDefaultRooms first.');
      process.exit(2);
    }

    if (lock) {
      user.passwordHash = SENTINEL_HASH;
      await user.save();
      console.log('[setSystemPassword] system user re-locked (non-loginable sentinel restored).');
      return;
    }

    user.passwordHash = await bcrypt.hash(rawPassword as string, config.bcryptSaltRounds);
    await user.save();
    console.log(
      '[setSystemPassword] Done.\n' +
        '  email:    system@safegroup.local\n' +
        '  username: system\n' +
        '  password: (the one you just passed in)\n',
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[setSystemPassword] Fatal:', err);
  process.exit(1);
});
