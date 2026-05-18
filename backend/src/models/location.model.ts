import { Schema, model, Document, Types } from 'mongoose';

export interface ILocation extends Document {
  userId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  source: 'gps' | 'network' | 'passive';
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number, default: 0 },
    speed: { type: Number, default: null },
    heading: { type: Number, default: null },
    altitude: { type: Number, default: null },
    source: { type: String, enum: ['gps', 'network', 'passive'], default: 'gps' },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

LocationSchema.index({ userId: 1, recordedAt: -1 });
LocationSchema.index({ roomId: 1, recordedAt: -1 });
// TTL: auto-delete after 30 days
LocationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Location = model<ILocation>('Location', LocationSchema);
