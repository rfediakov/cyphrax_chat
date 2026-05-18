import { Schema, model, Types, Document } from 'mongoose';

export type CallType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export interface ICall extends Document {
  callId: string;
  type: CallType;
  status: CallStatus;
  callerId: Types.ObjectId;
  calleeId?: Types.ObjectId;
  roomId?: Types.ObjectId;
  /** participants for group calls */
  participants: Types.ObjectId[];
  startedAt?: Date;
  endedAt?: Date;
  duration?: number; // seconds
  createdAt: Date;
  updatedAt: Date;
}

const callSchema = new Schema<ICall>(
  {
    callId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['audio', 'video'], required: true },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'missed', 'declined'],
      default: 'ringing',
    },
    callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calleeId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    startedAt: { type: Date },
    endedAt: { type: Date },
    duration: { type: Number },
  },
  { timestamps: true },
);

export const Call = model<ICall>('Call', callSchema);
