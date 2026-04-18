import { Schema, model, Document, Types } from 'mongoose';

export interface ILastRead extends Document {
  userId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  dialogId: Types.ObjectId | null;
  lastReadAt: Date;
}

const LastReadSchema = new Schema<ILastRead>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    dialogId: { type: Schema.Types.ObjectId, ref: 'Dialog', default: null },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

LastReadSchema.index({ userId: 1, roomId: 1 }, { sparse: true });
LastReadSchema.index({ userId: 1, dialogId: 1 }, { sparse: true });

export const LastRead = model<ILastRead>('LastRead', LastReadSchema);
