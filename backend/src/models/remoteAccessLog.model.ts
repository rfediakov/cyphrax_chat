import { Schema, model, Document, Types } from 'mongoose';

export type ConsentDuration = 1 | 5; // minutes
export type EndedBy = 'requester' | 'target' | 'timeout';

export interface IRemoteAccessLog extends Document {
  requesterId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  requestedAt: Date;
  consentGiven: boolean;
  consentDuration: ConsentDuration | null; // minutes
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  endedBy: EndedBy | null;
}

const RemoteAccessLogSchema = new Schema<IRemoteAccessLog>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    consentGiven: { type: Boolean, required: true },
    consentDuration: { type: Number, default: null },
    sessionStartedAt: { type: Date, default: null },
    sessionEndedAt: { type: Date, default: null },
    endedBy: {
      type: String,
      enum: ['requester', 'target', 'timeout'],
      default: null,
    },
  },
  { timestamps: false },
);

RemoteAccessLogSchema.index({ targetUserId: 1, requestedAt: -1 });
RemoteAccessLogSchema.index({ requesterId: 1, requestedAt: -1 });

export const RemoteAccessLog = model<IRemoteAccessLog>('RemoteAccessLog', RemoteAccessLogSchema);
