import { Schema, model, Document, Types } from 'mongoose';

export interface IFriendRequest extends Document {
  fromUser: Types.ObjectId;
  toUser: Types.ObjectId;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const FriendRequestSchema = new Schema<IFriendRequest>(
  {
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  { timestamps: true },
);

FriendRequestSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });
FriendRequestSchema.index({ toUser: 1, status: 1 });

export const FriendRequest = model<IFriendRequest>('FriendRequest', FriendRequestSchema);
