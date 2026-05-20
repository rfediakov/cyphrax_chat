import { Schema, model, Document, Types } from 'mongoose';

/**
 * Built-in marker categories. Keep this list in sync with the frontend's
 * `MARKER_KINDS` constant so both sides agree on the available options.
 */
export const MAP_MARKER_KINDS = [
  'pin',
  'meet',
  'hazard',
  'food',
  'camp',
  'photo',
] as const;

export type MapMarkerKind = (typeof MAP_MARKER_KINDS)[number];

export interface IMapMarker extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  username: string;
  kind: MapMarkerKind;
  label: string;
  description: string;
  lat: number;
  lng: number;
  /** Optional override color (hex). Defaults are resolved on the client. */
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MapMarkerSchema = new Schema<IMapMarker>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    kind: {
      type: String,
      enum: MAP_MARKER_KINDS,
      default: 'pin',
      required: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    color: { type: String, default: null, maxlength: 16 },
  },
  { timestamps: true },
);

MapMarkerSchema.index({ roomId: 1, createdAt: -1 });

export const MapMarker = model<IMapMarker>('MapMarker', MapMarkerSchema);
