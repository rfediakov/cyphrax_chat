import { Schema, model, Document, Types } from 'mongoose';

export type OfflineActionType =
  | 'send_message'
  | 'location_update'
  | 'telemetry_update'
  | 'sos_trigger'
  | 'send_audio'
  | 'send_video';

export interface IOfflineQueue extends Document {
  userId: Types.ObjectId;
  action: OfflineActionType;
  payload: Record<string, unknown>;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const OfflineQueueSchema = new Schema<IOfflineQueue>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: ['send_message', 'location_update', 'telemetry_update', 'sos_trigger', 'send_audio', 'send_video'],
    },
    payload: { type: Schema.Types.Mixed, required: true },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL: auto-delete processed items after 72 hours
OfflineQueueSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 72 * 60 * 60 },
);

export const OfflineQueue = model<IOfflineQueue>('OfflineQueue', OfflineQueueSchema);
