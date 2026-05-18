import { Schema, model, Document, Types } from 'mongoose';

export type SOSStatus = 'active' | 'resolved';

export interface ISOSEvent extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  username: string;
  lat: number;
  lng: number;
  message: string;
  status: SOSStatus;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SOSEventSchema = new Schema<ISOSEvent>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    message: { type: String, default: "I'm in danger" },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SOSEventSchema.index({ roomId: 1, status: 1 });
SOSEventSchema.index({ userId: 1, status: 1 });

export const SOSEvent = model<ISOSEvent>('SOSEvent', SOSEventSchema);
