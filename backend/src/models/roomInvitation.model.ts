import { Schema, model, Document, Types } from 'mongoose';

export interface IRoomInvitation extends Document {
  roomId: Types.ObjectId;
  invitedBy: Types.ObjectId;
  invitedUser: Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const RoomInvitationSchema = new Schema<IRoomInvitation>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    invitedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  { timestamps: true },
);

RoomInvitationSchema.index({ roomId: 1, invitedUser: 1 });
RoomInvitationSchema.index({ invitedUser: 1, status: 1 });

export const RoomInvitation = model<IRoomInvitation>('RoomInvitation', RoomInvitationSchema);
