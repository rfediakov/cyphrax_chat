import { Types } from 'mongoose';
import { Room } from '../../models/room.model.js';
import { RoomMember } from '../../models/roomMember.model.js';
import { FmStation, type IFmStation } from '../../models/fmStation.model.js';
import { FmStationVote } from '../../models/fmStationVote.model.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors.js';

/**
 * Service slice powering the FM Tuner room type.
 *
 * Two playback modes coexist:
 *  - "vote" — the default. Every member can cast one active vote; the station
 *    with the most votes plays, ties broken by the newest most-recent vote.
 *  - "deck" — owner/admin "takes the deck" and pins a single station for a
 *    bounded duration. While `room.config.fmDeckUntil` is in the future,
 *    `getNowPlaying` ignores the tally and returns the deck station.
 *
 * The service is pure data — socket fan-out happens in the route handler so
 * we keep a single source of truth for io.to() calls.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface FmStationPublic {
  id: string;
  name: string;
  streamUrl: string;
  tags: string[];
  addedBy: string | null;
  isCurated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FmTallyEntry {
  stationId: string;
  votes: number;
}

export interface FmTally {
  winnerStationId: string | null;
  totals: FmTallyEntry[];
}

export type FmNowPlayingSource = 'vote' | 'deck';

export interface FmNowPlaying {
  stationId: string;
  station: FmStationPublic;
  source: FmNowPlayingSource;
  voteCount?: number;
  totalMembers?: number;
}

export interface FmVoteResult {
  totals: FmTallyEntry[];
  nowPlaying: FmNowPlaying | null;
  previousWinnerStationId: string | null;
}

interface FmRoomConfig {
  fmDeckStationId?: string | null;
  fmDeckUntil?: string | null;
  [k: string]: unknown;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toStationPublic(doc: IFmStation): FmStationPublic {
  return {
    id: String(doc._id),
    name: doc.name,
    streamUrl: doc.streamUrl,
    tags: doc.tags ?? [],
    addedBy: doc.addedBy ? String(doc.addedBy) : null,
    isCurated: Boolean(doc.isCurated),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function leanStationToPublic(raw: Record<string, unknown>): FmStationPublic {
  return {
    id: String(raw._id),
    name: raw.name as string,
    streamUrl: raw.streamUrl as string,
    tags: (raw.tags as string[]) ?? [],
    addedBy: raw.addedBy ? String(raw.addedBy) : null,
    isCurated: Boolean(raw.isCurated),
    createdAt: raw.createdAt as Date,
    updatedAt: raw.updatedAt as Date,
  };
}

function isValidStreamUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** Verify the caller is a member of `roomId` — mirrors `getMembers` gate. */
async function requireMember(roomId: Types.ObjectId, userId: string): Promise<void> {
  const member = await RoomMember.findOne({
    roomId,
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!member) {
    throw new ForbiddenError('You are not a member of this room');
  }
}

/**
 * Verify the caller is an admin or owner of the room. Mirrors the private
 * helper of the same name in `room.service.ts` (kept local to avoid leaking
 * an internal helper out of that module).
 */
async function requireAdminOrOwner(
  roomId: Types.ObjectId,
  userId: string,
): Promise<{ isOwner: boolean }> {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new NotFoundError('Room not found');

  if (room.ownerId.toString() === userId) return { isOwner: true };

  const member = await RoomMember.findOne({
    roomId,
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!member || member.role !== 'admin') {
    throw new ForbiddenError('Admin or owner privileges required');
  }
  return { isOwner: false };
}

// ── Station directory ──────────────────────────────────────────────────────

export interface ListStationsParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListStationsResult {
  stations: FmStationPublic[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listStations({
  q,
  page = 1,
  pageSize = 30,
}: ListStationsParams): Promise<ListStationsResult> {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const skip = (safePage - 1) * safeSize;

  const filter: Record<string, unknown> = {};
  if (q && q.trim().length > 0) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { tags: rx }];
  }

  const [raws, total] = await Promise.all([
    FmStation.find(filter)
      // Curated first, then newest user-added; stable secondary sort by _id.
      .sort({ isCurated: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(safeSize)
      .lean(),
    FmStation.countDocuments(filter),
  ]);

  return {
    stations: raws.map((raw) => leanStationToPublic(raw as unknown as Record<string, unknown>)),
    page: safePage,
    pageSize: safeSize,
    total,
  };
}

export interface ProposeStationPayload {
  name: string;
  streamUrl: string;
  tags?: string[];
}

export async function proposeStation(
  userId: string,
  payload: ProposeStationPayload,
): Promise<FmStationPublic> {
  const name = (payload.name ?? '').trim();
  const streamUrl = (payload.streamUrl ?? '').trim();
  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 32)
        .slice(0, 8)
    : [];

  if (name.length === 0 || name.length > 80) {
    throw new BadRequestError('name must be 1–80 characters');
  }
  if (!isValidStreamUrl(streamUrl)) {
    throw new BadRequestError('streamUrl must be an http(s) URL');
  }

  const existing = await FmStation.findOne({ streamUrl }).lean();
  if (existing) {
    throw new ConflictError('Station already exists');
  }

  const created = await FmStation.create({
    name,
    streamUrl,
    tags,
    addedBy: new Types.ObjectId(userId),
    isCurated: false,
  });

  return toStationPublic(created);
}

// ── Votes & tally ──────────────────────────────────────────────────────────

interface AggregatedTally {
  _id: Types.ObjectId;
  votes: number;
  mostRecent: Date;
}

async function computeTally(roomId: Types.ObjectId): Promise<FmTally> {
  const raw = (await FmStationVote.aggregate([
    { $match: { roomId } },
    {
      $group: {
        _id: '$stationId',
        votes: { $sum: 1 },
        mostRecent: { $max: '$createdAt' },
      },
    },
    { $sort: { votes: -1, mostRecent: -1 } },
  ])) as AggregatedTally[];

  const totals = raw.map((r) => ({ stationId: String(r._id), votes: r.votes }));
  const winnerStationId = totals.length > 0 ? totals[0].stationId : null;
  return { winnerStationId, totals };
}

function isDeckActive(config: FmRoomConfig | null | undefined): {
  active: boolean;
  stationId: string | null;
  deckUntil: string | null;
} {
  const stationId = config?.fmDeckStationId ?? null;
  const deckUntil = config?.fmDeckUntil ?? null;
  if (!stationId || !deckUntil) return { active: false, stationId: null, deckUntil: null };

  const until = new Date(deckUntil).getTime();
  if (!Number.isFinite(until) || until <= Date.now()) {
    return { active: false, stationId: null, deckUntil: null };
  }
  return { active: true, stationId, deckUntil };
}

async function loadStation(stationId: string): Promise<FmStationPublic | null> {
  if (!Types.ObjectId.isValid(stationId)) return null;
  const raw = await FmStation.findById(stationId).lean();
  return raw ? leanStationToPublic(raw as unknown as Record<string, unknown>) : null;
}

export async function getRoomTally(roomId: string): Promise<FmTally> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  return computeTally(new Types.ObjectId(roomId));
}

export async function getUserVote(roomId: string, userId: string): Promise<string | null> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const vote = await FmStationVote.findOne({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(userId),
  }).lean();
  return vote ? String(vote.stationId) : null;
}

export async function getNowPlaying(roomId: string): Promise<FmNowPlaying | null> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);

  const room = await Room.findById(roomObjectId).lean();
  if (!room) throw new NotFoundError('Room not found');

  // Deck overrides voting while it's active.
  const deck = isDeckActive(room.config as FmRoomConfig | null);
  if (deck.active && deck.stationId) {
    const station = await loadStation(deck.stationId);
    if (station) {
      return { stationId: station.id, station, source: 'deck' };
    }
  }

  const tally = await computeTally(roomObjectId);
  if (!tally.winnerStationId) return null;

  const station = await loadStation(tally.winnerStationId);
  if (!station) return null;

  const winnerEntry = tally.totals[0];
  const totalMembers = await RoomMember.countDocuments({ roomId: roomObjectId });

  return {
    stationId: station.id,
    station,
    source: 'vote',
    voteCount: winnerEntry?.votes ?? 0,
    totalMembers,
  };
}

/**
 * Cast / replace this user's vote for `stationId`. Returns the new tally plus
 * the previous winner so the route handler can decide whether to fan out
 * `now_playing` (only on change).
 */
export async function castVote(
  roomId: string,
  userId: string,
  stationId: string,
): Promise<FmVoteResult> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  if (!Types.ObjectId.isValid(stationId)) throw new BadRequestError('Invalid station id');

  const roomObjectId = new Types.ObjectId(roomId);
  const stationObjectId = new Types.ObjectId(stationId);

  await requireMember(roomObjectId, userId);

  const station = await FmStation.findById(stationObjectId).lean();
  if (!station) throw new NotFoundError('Station not found');

  const beforeTally = await computeTally(roomObjectId);
  const previousWinnerStationId = beforeTally.winnerStationId;

  // Upsert the vote; bump createdAt so the recency-based tie break uses the
  // latest user action.
  await FmStationVote.findOneAndUpdate(
    { roomId: roomObjectId, userId: new Types.ObjectId(userId) },
    {
      $set: {
        roomId: roomObjectId,
        userId: new Types.ObjectId(userId),
        stationId: stationObjectId,
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  const nowPlaying = await getNowPlaying(roomId);
  const tally = await computeTally(roomObjectId);

  return {
    totals: tally.totals,
    nowPlaying,
    previousWinnerStationId,
  };
}

export async function clearVote(roomId: string, userId: string): Promise<FmVoteResult> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);

  await requireMember(roomObjectId, userId);

  const beforeTally = await computeTally(roomObjectId);
  const previousWinnerStationId = beforeTally.winnerStationId;

  await FmStationVote.deleteOne({
    roomId: roomObjectId,
    userId: new Types.ObjectId(userId),
  });

  const nowPlaying = await getNowPlaying(roomId);
  const tally = await computeTally(roomObjectId);

  return {
    totals: tally.totals,
    nowPlaying,
    previousWinnerStationId,
  };
}

// ── Deck ───────────────────────────────────────────────────────────────────

export interface DeckState {
  deckStationId: string | null;
  deckUntil: string | null;
  nowPlaying: FmNowPlaying | null;
}

const DEFAULT_DECK_SEC = 300; // 5 min
const MAX_DECK_SEC = 60 * 60; // 1 hour cap

export async function takeDeck(
  roomId: string,
  callerId: string,
  stationId: string,
  durationSec?: number,
): Promise<DeckState> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  if (!Types.ObjectId.isValid(stationId)) throw new BadRequestError('Invalid station id');

  const roomObjectId = new Types.ObjectId(roomId);
  await requireAdminOrOwner(roomObjectId, callerId);

  const station = await FmStation.findById(stationId).lean();
  if (!station) throw new NotFoundError('Station not found');

  const safeSec = Math.min(
    MAX_DECK_SEC,
    Math.max(10, Math.floor(durationSec ?? DEFAULT_DECK_SEC)),
  );
  const deckUntil = new Date(Date.now() + safeSec * 1000).toISOString();

  const room = await Room.findById(roomObjectId);
  if (!room) throw new NotFoundError('Room not found');

  const nextConfig: Record<string, unknown> = {
    ...((room.config as Record<string, unknown> | undefined) ?? {}),
    fmDeckStationId: stationId,
    fmDeckUntil: deckUntil,
  };
  room.config = nextConfig;
  room.markModified('config');
  await room.save();

  const nowPlaying = await getNowPlaying(roomId);
  return { deckStationId: stationId, deckUntil, nowPlaying };
}

export async function releaseDeck(roomId: string, callerId: string): Promise<DeckState> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);
  await requireAdminOrOwner(roomObjectId, callerId);

  const room = await Room.findById(roomObjectId);
  if (!room) throw new NotFoundError('Room not found');

  const nextConfig: Record<string, unknown> = {
    ...((room.config as Record<string, unknown> | undefined) ?? {}),
  };
  delete nextConfig.fmDeckStationId;
  delete nextConfig.fmDeckUntil;
  room.config = nextConfig;
  room.markModified('config');
  await room.save();

  const nowPlaying = await getNowPlaying(roomId);
  return { deckStationId: null, deckUntil: null, nowPlaying };
}
