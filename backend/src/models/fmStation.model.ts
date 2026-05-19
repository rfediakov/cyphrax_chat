import { Schema, model, Document, Types } from 'mongoose';

/**
 * Internet-radio station registered with the FM Tuner room type.
 *
 * Stations come from two places:
 *  - curated seed list shipped with the server (isCurated = true)
 *  - user-proposed stations (`isCurated = false`), with the proposer tracked
 *    via `addedBy` (nullable to keep history when the user is deleted).
 *
 * `streamUrl` is the canonical identity: we reject duplicate proposals by URL
 * so the same station can't be added twice. Names are free-form.
 */
export interface IFmStation extends Document {
  name: string;
  streamUrl: string;
  tags: string[];
  addedBy: Types.ObjectId | null;
  isCurated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FmStationSchema = new Schema<IFmStation>(
  {
    name: { type: String, required: true, trim: true },
    streamUrl: { type: String, required: true, unique: true, trim: true },
    tags: { type: [String], default: [] },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isCurated: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

FmStationSchema.index({ tags: 1 });

export const FmStation = model<IFmStation>('FmStation', FmStationSchema);
