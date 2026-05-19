/**
 * Seed system "default" rooms so every fresh SafeGroup install boots with the
 * canonical typed-room examples (Radio Enthusiasts, FM Radio Lounge, Music
 * Jukebox, …).
 *
 * The script is idempotent — running it twice does not create duplicates.
 * The "system bot" owner user is created on first run with a non-loginable
 * password hash (a 60-char bcrypt-shape sentinel that no bcrypt.compare call
 * will ever match).
 *
 * Run with:  cd backend && npx ts-node src/scripts/seedDefaultRooms.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Room, type RoomType } from '../models/room.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { User } from '../models/user.model.js';
import { FmStation } from '../models/fmStation.model.js';

interface SeedSpec {
  name: string;
  description: string;
  type: RoomType;
  config?: Record<string, unknown>;
}

const SEEDS: SeedSpec[] = [
  {
    name: 'Radio Enthusiasts',
    description: 'Talk to other operators over AM/FM/sub-GHz via the in-app audio modem.',
    type: 'radio_mesh',
    config: { defaultMode: 'bfsk300', encrypted: false, keyTailMs: 250 },
  },
  {
    name: 'FM Radio Lounge',
    description: 'Listen together; vote what plays next.',
    type: 'fm_tuner',
    config: { allowTakeTheDeck: true, voteWindowSec: 30 },
  },
  {
    name: 'Music Jukebox',
    description: 'Queue tracks, vote-skip, vote-next, lyrics overlay.',
    type: 'music_jukebox',
    config: { skipThreshold: 0.5, crossfadeMs: 1500 },
  },
  {
    name: 'Dating',
    description: 'Local matches, time-boxed icebreakers, optional anonymity.',
    type: 'dating',
    config: { maskByDefault: true, distanceBuckets: [1, 5, 25] },
  },
  {
    name: 'Parental Controls',
    description: 'Family-only space with geofencing, content filter, and check-in routines.',
    type: 'parental',
    config: { checkInHourUtc: 18 },
  },
  {
    name: 'Watch Party',
    description: 'Synced video timeline, reactions overlay, hand raise.',
    type: 'watch_party',
    config: {},
  },
  {
    name: 'Sport Activity',
    description: 'Live GPS routes, segments, leaderboards on top of existing telemetry.',
    type: 'sports',
    config: {},
  },
  {
    name: 'News & Debate',
    description: 'Aggregated stories, room-level up/downvote, timed-turn debate threads.',
    type: 'news',
    config: { turnSec: 60 },
  },
  {
    name: 'Marketplace',
    description: 'Item listings with geo radius and offline price-card share.',
    type: 'market',
    config: {},
  },
  {
    name: 'Study Room',
    description: 'Pomodoro timer, shared whiteboard, focus presence.',
    type: 'study',
    config: { pomodoroWorkMin: 25, pomodoroBreakMin: 5 },
  },
  {
    name: 'Game Lobby',
    description: 'Lightweight multiplayer minigames (chess, codenames, drawing).',
    type: 'game',
    config: {},
  },
];

/**
 * Create or fetch the synthetic "system" user that owns seeded rooms. The
 * password hash is a sentinel — no real bcrypt-verify call can possibly match,
 * which is the documented way to mark an account as non-loginable without
 * adding a new column.
 */
async function getOrCreateSystemUser() {
  const existing = await User.findOne({ username: 'system' });
  if (existing) return existing;

  return User.create({
    username: 'system',
    email: 'system@safegroup.local',
    passwordHash: 'no-login:safegroup-system-bot-non-loginable-sentinel-hash________',
  });
}

async function seedDefaultRooms(): Promise<void> {
  const systemUser = await getOrCreateSystemUser();
  const systemUserId = systemUser._id;

  let created = 0;
  let updated = 0;

  for (const spec of SEEDS) {
    const existing = await Room.findOne({ name: spec.name });
    if (existing) {
      // Backfill type / isSystem on rooms that may pre-date this script.
      let dirty = false;
      if (existing.type !== spec.type) {
        existing.type = spec.type;
        dirty = true;
      }
      if (!existing.isSystem) {
        existing.isSystem = true;
        dirty = true;
      }
      if (spec.config && Object.keys(existing.config ?? {}).length === 0) {
        existing.config = { ...spec.config };
        dirty = true;
      }
      if (dirty) {
        await existing.save();
        updated += 1;
      }
      continue;
    }

    const room = await Room.create({
      name: spec.name,
      description: spec.description,
      visibility: 'public',
      ownerId: systemUserId,
      type: spec.type,
      config: spec.config ?? {},
      isSystem: true,
    });

    await RoomMember.create({ roomId: room._id, userId: systemUserId, role: 'admin' });
    created += 1;
  }

  console.log(`[seedDefaultRooms] created=${created} updated=${updated} total=${SEEDS.length}`);

  await seedCuratedFmStations();
}

interface FmStationSeed {
  name: string;
  streamUrl: string;
  tags: string[];
}

/**
 * Six freely-streamable internet-radio stations to bootstrap the FM Tuner
 * room. Idempotent — skipped if a station with the same `streamUrl` already
 * exists. All entries are marked `isCurated: true` so they sort to the top
 * of the directory.
 */
const FM_STATION_SEEDS: FmStationSeed[] = [
  {
    name: 'SomaFM — Groove Salad',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    tags: ['ambient', 'downtempo', 'chillout'],
  },
  {
    name: 'SomaFM — Drone Zone',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    tags: ['ambient', 'drone', 'atmospheric'],
  },
  {
    name: 'SomaFM — Indie Pop Rocks!',
    streamUrl: 'https://ice1.somafm.com/indiepop-128-mp3',
    tags: ['indie', 'pop', 'rock'],
  },
  {
    name: 'SomaFM — Secret Agent',
    streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
    tags: ['lounge', 'jazz', 'spy'],
  },
  {
    name: 'Radio Paradise — Main Mix',
    streamUrl: 'https://stream.radioparadise.com/aac-128',
    tags: ['eclectic', 'rock', 'world'],
  },
  {
    name: 'Radio Caprice — Jazz',
    streamUrl: 'http://79.120.39.202:8000/jazz',
    tags: ['jazz', 'classic'],
  },
];

async function seedCuratedFmStations(): Promise<void> {
  let created = 0;
  let updated = 0;
  for (const spec of FM_STATION_SEEDS) {
    const existing = await FmStation.findOne({ streamUrl: spec.streamUrl });
    if (existing) {
      // Backfill `isCurated` / tag updates without touching user-edited fields.
      let dirty = false;
      if (!existing.isCurated) {
        existing.isCurated = true;
        dirty = true;
      }
      if ((existing.tags?.length ?? 0) === 0 && spec.tags.length > 0) {
        existing.tags = [...spec.tags];
        dirty = true;
      }
      if (dirty) {
        await existing.save();
        updated += 1;
      }
      continue;
    }

    await FmStation.create({
      name: spec.name,
      streamUrl: spec.streamUrl,
      tags: spec.tags,
      isCurated: true,
      addedBy: null,
    });
    created += 1;
  }

  console.log(
    `[seedCuratedFmStations] created=${created} updated=${updated} total=${FM_STATION_SEEDS.length}`,
  );
}

async function main() {
  await mongoose.connect(config.mongodbUri);
  try {
    await seedDefaultRooms();
  } finally {
    await mongoose.disconnect();
  }
}

// Exported so other modules (e.g. tests) can call the seeder directly.
export { seedDefaultRooms };

// Only auto-run when invoked as a script (ts-node / node), not when imported.
if (require.main === module) {
  main().catch((err) => {
    console.error('[seedDefaultRooms] Fatal:', err);
    process.exit(1);
  });
}
