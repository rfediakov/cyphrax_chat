import { Schema, model, Document, Types } from 'mongoose';

/**
 * Type-specific room roles (DJ, Net Control, Guardian, Moderator, Tutor, …)
 * live in their own collection so we don't overload the `roomMembers.role`
 * field, which stays the simple `member | admin` ladder.
 *
 * A user may carry multiple role tags in the same room.
 */

export const ROOM_ROLE_NAMES = [
  'dj',
  'net_control',
  'guardian',
  'moderator',
  'tutor',
  'host',
] as const;

export type RoomRoleName = (typeof ROOM_ROLE_NAMES)[number];

export interface IRoomRole extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  role: RoomRoleName | string;
  createdAt: Date;
  updatedAt: Date;
}

const RoomRoleSchema = new Schema<IRoomRole>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
  },
  { timestamps: true },
);

RoomRoleSchema.index({ roomId: 1, userId: 1, role: 1 }, { unique: true });

export const RoomRole = model<IRoomRole>('RoomRole', RoomRoleSchema);
