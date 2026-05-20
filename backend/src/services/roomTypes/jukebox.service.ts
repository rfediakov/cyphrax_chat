import { Types } from 'mongoose';
import { Room } from '../../models/room.model.js';
import { RoomMember } from '../../models/roomMember.model.js';
import { RoomRole } from '../../models/roomRole.model.js';
import { Attachment } from '../../models/attachment.model.js';
import {
  JukeboxTrack,
  type IJukeboxTrack,
} from '../../models/jukeboxTrack.model.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors.js';

/**
 * Service slice powering the Music Jukebox room type.
 *
 * Concepts:
 *  - A room has at most one `playing` track at a time.
 *  - Other tracks live in the `queued` pool, ordered by ascending `position`.
 *  - Skip votes are tallied against the *currently playing* track. When the
 *    ratio of votes to total members reaches `room.config.skipThreshold`
 *    (default 0.5), `advance()` runs automatically.
 *  - "Total members" means **every `RoomMember`**, not just online ones. This
 *    keeps the quorum simple and predictable — no presence dependency — and
 *    is documented in the dispatch helper below.
 *
 * All public functions are pure data; socket fan-out lives in the routes
 * module so we keep io.to(...) calls in one place.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface JukeboxTrackPublic {
  id: string;
  roomId: string;
  title: string;
  artist: string;
  durationSec: number | null;
  attachmentId: string | null;
  externalUrl: string | null;
  addedBy: string;
  position: number;
  playState: IJukeboxTrack['playState'];
  startedAt: string | null;
  skipVotes: string[];
  voteNextBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface QueueSnapshot {
  playing: JukeboxTrackPublic | null;
  queue: JukeboxTrackPublic[];
}

export interface SkipVoteResult {
  ratio: { votes: number; total: number };
  advanced: boolean;
  trackId: string | null;
  snapshot: QueueSnapshot;
}

interface JukeboxRoomConfig {
  skipThreshold?: number;
  [k: string]: unknown;
}

const DEFAULT_SKIP_THRESHOLD = 0.5;

// ── Helpers ────────────────────────────────────────────────────────────────

function toPublic(doc: IJukeboxTrack): JukeboxTrackPublic {
  return {
    id: String(doc._id),
    roomId: String(doc.roomId),
    title: doc.title,
    artist: doc.artist ?? '',
    durationSec: typeof doc.durationSec === 'number' ? doc.durationSec : null,
    attachmentId: doc.attachmentId ? String(doc.attachmentId) : null,
    externalUrl: doc.externalUrl ?? null,
    addedBy: String(doc.addedBy),
    position: doc.position,
    playState: doc.playState,
    startedAt: doc.startedAt ? doc.startedAt.toISOString() : null,
    skipVotes: (doc.skipVotes ?? []).map((u) => String(u)),
    voteNextBy: (doc.voteNextBy ?? []).map((u) => String(u)),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function leanToPublic(raw: Record<string, unknown>): JukeboxTrackPublic {
  const doc = raw as unknown as IJukeboxTrack;
  return toPublic(doc);
}

function isValidExternalUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

async function requireMember(roomId: Types.ObjectId, userId: string): Promise<void> {
  const member = await RoomMember.findOne({
    roomId,
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!member) {
    throw new ForbiddenError('You are not a member of this room');
  }
}

async function requireRoom(roomId: Types.ObjectId) {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new NotFoundError('Room not found');
  return room;
}

/** True if the caller is the room owner or has the `admin` member role. */
async function isAdminOrOwner(roomId: Types.ObjectId, userId: string): Promise<boolean> {
  const room = await Room.findById(roomId).lean();
  if (!room) return false;
  if (room.ownerId.toString() === userId) return true;
  const member = await RoomMember.findOne({
    roomId,
    userId: new Types.ObjectId(userId),
  }).lean();
  return member?.role === 'admin';
}

/** True if the caller carries the `dj` typed-role for the room. */
async function isDj(roomId: Types.ObjectId, userId: string): Promise<boolean> {
  const dj = await RoomRole.findOne({
    roomId,
    userId: new Types.ObjectId(userId),
    role: 'dj',
  }).lean();
  return dj !== null;
}

function getSkipThreshold(config: unknown): number {
  const raw = (config as JukeboxRoomConfig | null | undefined)?.skipThreshold;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_SKIP_THRESHOLD;
  if (raw <= 0) return DEFAULT_SKIP_THRESHOLD;
  // Clamp to (0,1].
  return Math.min(1, raw);
}

// ── Queue read ─────────────────────────────────────────────────────────────

/**
 * Returns the current playing track (or null) plus all queued tracks ordered
 * by ascending `position`. Completed / skipped tracks are not included.
 */
export async function getQueue(roomId: string): Promise<QueueSnapshot> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);

  const [playingRaw, queueRaws] = await Promise.all([
    JukeboxTrack.findOne({ roomId: roomObjectId, playState: 'playing' }).lean(),
    JukeboxTrack.find({ roomId: roomObjectId, playState: 'queued' })
      .sort({ position: 1, createdAt: 1 })
      .lean(),
  ]);

  return {
    playing: playingRaw ? leanToPublic(playingRaw as Record<string, unknown>) : null,
    queue: queueRaws.map((r) => leanToPublic(r as Record<string, unknown>)),
  };
}

// ── Enqueue ────────────────────────────────────────────────────────────────

export interface EnqueuePayload {
  title: string;
  artist?: string;
  durationSec?: number;
  attachmentId?: string;
  externalUrl?: string;
}

/**
 * Append a new track to the room's queue.
 *
 * Exactly one of `attachmentId` / `externalUrl` must be provided. If no track
 * is currently `playing` for this room, the new track is auto-promoted to the
 * `playing` state so the room never sits idle when there's at least one item.
 */
export async function enqueue(
  roomId: string,
  userId: string,
  payload: EnqueuePayload,
): Promise<{ track: JukeboxTrackPublic; snapshot: QueueSnapshot; trackChanged: boolean }> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);
  await requireRoom(roomObjectId);
  await requireMember(roomObjectId, userId);

  const title = (payload.title ?? '').trim();
  if (title.length === 0 || title.length > 200) {
    throw new BadRequestError('title must be 1–200 characters');
  }

  const hasAttachment =
    typeof payload.attachmentId === 'string' && payload.attachmentId.length > 0;
  const hasUrl =
    typeof payload.externalUrl === 'string' && payload.externalUrl.length > 0;

  if (hasAttachment === hasUrl) {
    throw new BadRequestError(
      'Provide exactly one of attachmentId or externalUrl',
    );
  }

  let attachmentObjectId: Types.ObjectId | null = null;
  let externalUrl: string | null = null;
  if (hasAttachment) {
    if (!Types.ObjectId.isValid(payload.attachmentId!)) {
      throw new BadRequestError('Invalid attachmentId');
    }
    attachmentObjectId = new Types.ObjectId(payload.attachmentId);
    const exists = await Attachment.findById(attachmentObjectId).lean();
    if (!exists) throw new NotFoundError('Attachment not found');
  } else {
    if (!isValidExternalUrl(payload.externalUrl!)) {
      throw new BadRequestError('externalUrl must be an http(s) URL');
    }
    externalUrl = payload.externalUrl!.trim();
  }

  const artist = typeof payload.artist === 'string' ? payload.artist.trim().slice(0, 200) : '';
  const durationSec =
    typeof payload.durationSec === 'number' &&
    Number.isFinite(payload.durationSec) &&
    payload.durationSec > 0
      ? Math.floor(payload.durationSec)
      : undefined;

  // Compute next position — append to tail of *all* active states so removals
  // never collide with active row positions.
  const tail = await JukeboxTrack.find({
    roomId: roomObjectId,
    playState: { $in: ['queued', 'playing'] },
  })
    .sort({ position: -1 })
    .limit(1)
    .lean();
  const nextPosition = tail.length > 0 ? (tail[0] as { position: number }).position + 1 : 0;

  // Determine whether the queue is currently idle (nothing playing). If so the
  // new track becomes the playing track immediately so the room never sits
  // silent when there's at least one track to play.
  const playing = await JukeboxTrack.findOne({
    roomId: roomObjectId,
    playState: 'playing',
  }).lean();
  const initialState: IJukeboxTrack['playState'] = playing ? 'queued' : 'playing';
  const startedAt = initialState === 'playing' ? new Date() : null;

  const created = await JukeboxTrack.create({
    roomId: roomObjectId,
    title,
    artist,
    durationSec,
    attachmentId: attachmentObjectId,
    externalUrl,
    addedBy: new Types.ObjectId(userId),
    position: nextPosition,
    playState: initialState,
    startedAt,
  });

  const snapshot = await getQueue(roomId);
  return { track: toPublic(created), snapshot, trackChanged: initialState === 'playing' };
}

// ── Remove ─────────────────────────────────────────────────────────────────

/**
 * Remove a track from the room. Owner-of-the-track and room-admin/owner both
 * have permission. Removing the currently playing track auto-advances.
 */
export async function removeTrack(
  roomId: string,
  userId: string,
  trackId: string,
): Promise<{ snapshot: QueueSnapshot; advanced: boolean; trackChanged: boolean }> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  if (!Types.ObjectId.isValid(trackId)) throw new BadRequestError('Invalid track id');

  const roomObjectId = new Types.ObjectId(roomId);
  await requireRoom(roomObjectId);
  await requireMember(roomObjectId, userId);

  const track = await JukeboxTrack.findOne({
    _id: new Types.ObjectId(trackId),
    roomId: roomObjectId,
  });
  if (!track) throw new NotFoundError('Track not found');

  const isOwnerOfTrack = track.addedBy.toString() === userId;
  const adminOrOwner = await isAdminOrOwner(roomObjectId, userId);
  if (!isOwnerOfTrack && !adminOrOwner) {
    throw new ForbiddenError('Only the track owner or a room admin can remove this track');
  }

  const wasPlaying = track.playState === 'playing';
  track.playState = 'skipped';
  await track.save();

  let advanced = false;
  if (wasPlaying) {
    const next = await advance(roomId);
    advanced = next !== null;
  }

  const snapshot = await getQueue(roomId);
  return { snapshot, advanced, trackChanged: wasPlaying };
}

// ── Reorder ────────────────────────────────────────────────────────────────

/**
 * Move `trackId` to a new position within the queue. DJ role or room admin/
 * owner only. The currently playing track keeps its position (the queue here
 * means only `queued` tracks); reordering other tracks shifts neighbours.
 */
export async function reorderTrack(
  roomId: string,
  callerId: string,
  trackId: string,
  newPosition: number,
): Promise<QueueSnapshot> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  if (!Types.ObjectId.isValid(trackId)) throw new BadRequestError('Invalid track id');
  if (!Number.isFinite(newPosition)) {
    throw new BadRequestError('position must be a finite number');
  }

  const roomObjectId = new Types.ObjectId(roomId);
  await requireRoom(roomObjectId);

  const allowed = (await isAdminOrOwner(roomObjectId, callerId)) || (await isDj(roomObjectId, callerId));
  if (!allowed) {
    throw new ForbiddenError('DJ, admin, or owner privileges required');
  }

  const target = await JukeboxTrack.findOne({
    _id: new Types.ObjectId(trackId),
    roomId: roomObjectId,
    playState: 'queued',
  });
  if (!target) {
    throw new NotFoundError('Track not found in queue');
  }

  // Resolve the canonical sorted list of queued tracks (excluding the target),
  // then splice the target into the requested slot, then renumber 0..n-1.
  const queued = await JukeboxTrack.find({
    roomId: roomObjectId,
    playState: 'queued',
    _id: { $ne: target._id },
  })
    .sort({ position: 1, createdAt: 1 })
    .lean();

  const clamped = Math.max(0, Math.min(Math.floor(newPosition), queued.length));
  const ids: Types.ObjectId[] = (queued as Array<{ _id: Types.ObjectId }>).map((q) => q._id);
  ids.splice(clamped, 0, target._id as Types.ObjectId);

  // Renumber the queued tracks starting at 1 (we reserve 0 for the playing
  // slot in the simplest case; positions only need to be monotonic, not
  // dense).
  for (let i = 0; i < ids.length; i++) {
    await JukeboxTrack.updateOne({ _id: ids[i] }, { $set: { position: i + 1 } });
  }

  return getQueue(roomId);
}

// ── Skip vote ──────────────────────────────────────────────────────────────

/**
 * Returns the count of members currently in the room. We deliberately count
 * **all** `RoomMember` documents (not just presence-online ones) so the
 * quorum is stable across reconnects and predictable for admins.
 */
export async function getRoomMemberCount(roomId: string): Promise<number> {
  if (!Types.ObjectId.isValid(roomId)) return 0;
  return RoomMember.countDocuments({ roomId: new Types.ObjectId(roomId) });
}

/**
 * Add the caller's vote to skip the currently playing track. Idempotent —
 * voting twice doesn't double-count. When the ratio of votes to total members
 * reaches `room.config.skipThreshold` (default 0.5) the playing track is
 * marked `skipped` and the room advances to the next queued track.
 */
export async function castSkipVote(
  roomId: string,
  userId: string,
): Promise<SkipVoteResult> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);
  const room = await requireRoom(roomObjectId);
  await requireMember(roomObjectId, userId);

  const playing = await JukeboxTrack.findOne({
    roomId: roomObjectId,
    playState: 'playing',
  });

  if (!playing) {
    // Nothing to skip — return an empty snapshot.
    return {
      ratio: { votes: 0, total: await getRoomMemberCount(roomId) },
      advanced: false,
      trackId: null,
      snapshot: await getQueue(roomId),
    };
  }

  // Idempotent add.
  const userObjectId = new Types.ObjectId(userId);
  const alreadyVoted = playing.skipVotes.some((u) => u.equals(userObjectId));
  if (!alreadyVoted) {
    playing.skipVotes.push(userObjectId);
    await playing.save();
  }

  const total = await getRoomMemberCount(roomId);
  const votes = playing.skipVotes.length;
  const threshold = getSkipThreshold(room.config);
  // Avoid divide-by-zero (shouldn't happen — the caller is a member — but be
  // safe). Treat a quorum reached when `votes / total >= threshold`.
  const quorum = total > 0 && votes / total >= threshold;

  let advanced = false;
  if (quorum) {
    playing.playState = 'skipped';
    await playing.save();
    const next = await advance(roomId);
    advanced = next !== null;
  }

  const snapshot = await getQueue(roomId);
  return {
    ratio: { votes, total },
    advanced,
    trackId: String(playing._id),
    snapshot,
  };
}

// ── Vote next ──────────────────────────────────────────────────────────────

/**
 * Move `trackId` to the front of the queue (position lower than every other
 * queued track). Any member can cast a vote-next; the `voteNextBy` array
 * prevents the same user from doing it twice. Tracks already moved by the
 * caller silently no-op — we still return the up-to-date snapshot.
 */
export async function castVoteNext(
  roomId: string,
  userId: string,
  trackId: string,
): Promise<QueueSnapshot> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  if (!Types.ObjectId.isValid(trackId)) throw new BadRequestError('Invalid track id');

  const roomObjectId = new Types.ObjectId(roomId);
  await requireRoom(roomObjectId);
  await requireMember(roomObjectId, userId);

  const target = await JukeboxTrack.findOne({
    _id: new Types.ObjectId(trackId),
    roomId: roomObjectId,
    playState: 'queued',
  });
  if (!target) throw new NotFoundError('Track not found in queue');

  const userObjectId = new Types.ObjectId(userId);
  const already = target.voteNextBy.some((u) => u.equals(userObjectId));
  if (already) {
    // No-op — still return the snapshot for consistency.
    return getQueue(roomId);
  }

  target.voteNextBy.push(userObjectId);

  // Move to the absolute front of the queue: find the minimum queued
  // position and place the target one slot below. Easier than renumbering
  // because positions only need to be monotonic.
  const minQueued = await JukeboxTrack.find({
    roomId: roomObjectId,
    playState: 'queued',
    _id: { $ne: target._id },
  })
    .sort({ position: 1 })
    .limit(1)
    .lean();

  if (minQueued.length > 0) {
    const minPosition = (minQueued[0] as { position: number }).position;
    target.position = minPosition - 1;
  }

  await target.save();
  return getQueue(roomId);
}

// ── Advance ────────────────────────────────────────────────────────────────

/**
 * Mark the currently playing track (if any) as `done` and promote the queued
 * track with the lowest position to `playing`. Returns the new playing track
 * or `null` when the queue is empty.
 *
 * This is the central place that "moves the needle" — called by:
 *  - vote-skip quorum
 *  - removeTrack when the current track is removed
 *  - the manual `advance` admin route
 *  - the client when the `<audio>` `ended` event fires
 */
export async function advance(roomId: string): Promise<JukeboxTrackPublic | null> {
  if (!Types.ObjectId.isValid(roomId)) throw new BadRequestError('Invalid room id');
  const roomObjectId = new Types.ObjectId(roomId);

  // Mark current playing as done if it's still flagged playing (skip already
  // moved it to `skipped`, but defensive code never hurts).
  const current = await JukeboxTrack.findOne({
    roomId: roomObjectId,
    playState: 'playing',
  });
  if (current) {
    current.playState = 'done';
    await current.save();
  }

  const next = await JukeboxTrack.findOne({
    roomId: roomObjectId,
    playState: 'queued',
  }).sort({ position: 1, createdAt: 1 });

  if (!next) return null;

  next.playState = 'playing';
  next.startedAt = new Date();
  next.skipVotes = [];
  await next.save();
  return toPublic(next);
}
