import { Schema, model, Document, Types } from 'mongoose';

export interface ITelemetry extends Document {
  userId: Types.ObjectId;
  battery: {
    level: number | null;       // 0.0 – 1.0, null = API unavailable
    charging: boolean | null;
    chargingTime: number | null;
    dischargingTime: number | null;
  };
  network: {
    online: boolean;
    effectiveType: string;
    downlink: number | null;
    saveData: boolean;
  };
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TelemetrySchema = new Schema<ITelemetry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    battery: {
      level: { type: Number, default: null },
      charging: { type: Boolean, default: null },
      chargingTime: { type: Number, default: null },
      dischargingTime: { type: Number, default: null },
    },
    network: {
      online: { type: Boolean, default: true },
      effectiveType: { type: String, default: 'unknown' },
      downlink: { type: Number, default: null },
      saveData: { type: Boolean, default: false },
    },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

TelemetrySchema.index({ userId: 1, recordedAt: -1 });
// TTL: auto-delete after 7 days
TelemetrySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const Telemetry = model<ITelemetry>('Telemetry', TelemetrySchema);
