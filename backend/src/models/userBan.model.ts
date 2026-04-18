import { Schema, model, Document, Types } from 'mongoose';

export interface IUserBan extends Document {
  blockerId: Types.ObjectId;
  blockedId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserBanSchema = new Schema<IUserBan>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

UserBanSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

export const UserBan = model<IUserBan>('UserBan', UserBanSchema);
