import { Schema, model, Document, Types } from 'mongoose';

/**
 * A single track in a Music Jukebox room's shared queue.
 *
 * Tracks reference either a SafeGroup attachment (`attachmentId`) — for tracks
 * uploaded via the existing attachment flow — or an external direct URL
 * (`externalUrl`). Exactly one of the two must be set; this is enforced at the
 * service layer (Mongoose can't express the XOR cleanly).
 *
 * `position` is an integer used to order the queue ascending. New tracks are
 * appended at `maxPosition + 1`; reordering renumbers other tracks so that
 * positions remain monotonically increasing within a room.
 *
 * `playState` is the lifecycle:
 *   queued  → in the queue, waiting its turn
 *   playing → currently playing (at most one per room)
 *   done    → finished naturally
 *   skipped → removed by vote-skip / manual remove
 *
 * `skipVotes` accumulates user ids that voted to skip the *currently playing*
 * track. `voteNextBy` accumulates user ids that have already voted-next on this
 * queued track (prevents double-voting from the same user).
 */

export const JUKEBOX_PLAY_STATES = ['queued', 'playing', 'done', 'skipped'] as const;
export type JukeboxPlayState = (typeof JUKEBOX_PLAY_STATES)[number];

export interface IJukeboxTrack extends Document {
  roomId: Types.ObjectId;
  title: string;
  artist?: string;
  durationSec?: number;
  attachmentId?: Types.ObjectId | null;
  externalUrl?: string | null;
  addedBy: Types.ObjectId;
  position: number;
  playState: JukeboxPlayState;
  startedAt?: Date | null;
  skipVotes: Types.ObjectId[];
  voteNextBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const JukeboxTrackSchema = new Schema<IJukeboxTrack>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    title: { type: String, required: true, trim: true },
    artist: { type: String, default: '' },
    durationSec: { type: Number, default: undefined },
    attachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment', default: null },
    externalUrl: { type: String, default: null },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    position: { type: Number, required: true },
    playState: {
      type: String,
      enum: JUKEBOX_PLAY_STATES,
      default: 'queued',
      index: true,
    },
    startedAt: { type: Date, default: null },
    skipVotes: { type: [Schema.Types.ObjectId], default: [] },
    voteNextBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

JukeboxTrackSchema.index({ roomId: 1, playState: 1, position: 1 });

export const JukeboxTrack = model<IJukeboxTrack>('JukeboxTrack', JukeboxTrackSchema);
