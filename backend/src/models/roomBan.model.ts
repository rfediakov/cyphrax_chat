import { Schema, model, Document, Types } from 'mongoose';

export interface IRoomBan extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  bannedBy: Types.ObjectId;
  bannedAt: Date;
}

const RoomBanSchema = new Schema<IRoomBan>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bannedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

RoomBanSchema.index({ roomId: 1, userId: 1 }, { unique: true });

export const RoomBan = model<IRoomBan>('RoomBan', RoomBanSchema);
