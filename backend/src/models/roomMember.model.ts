import { Schema, model, Document, Types } from 'mongoose';

export interface IRoomMember extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'member' | 'admin';
  joinedAt: Date;
}

const RoomMemberSchema = new Schema<IRoomMember>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

RoomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
RoomMemberSchema.index({ userId: 1 });

export const RoomMember = model<IRoomMember>('RoomMember', RoomMemberSchema);
