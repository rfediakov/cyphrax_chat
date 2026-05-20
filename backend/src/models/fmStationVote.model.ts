import { Schema, model, Document, Types } from 'mongoose';

/**
 * One member's active vote for which station should be playing in a given
 * FM Tuner room. A user has *at most* one active vote per room — voting for
 * a new station replaces the old vote (enforced via the unique compound index
 * `(roomId, userId)` and an upsert in the service layer).
 *
 * `createdAt` doubles as the tie-breaker for `getRoomTally`: when two
 * stations have the same vote count, the one whose most-recent vote is
 * newest wins.
 */
export interface IFmStationVote extends Document {
  roomId: Types.ObjectId;
  stationId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FmStationVoteSchema = new Schema<IFmStationVote>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    stationId: { type: Schema.Types.ObjectId, ref: 'FmStation', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

FmStationVoteSchema.index({ roomId: 1, userId: 1 }, { unique: true });

export const FmStationVote = model<IFmStationVote>('FmStationVote', FmStationVoteSchema);
