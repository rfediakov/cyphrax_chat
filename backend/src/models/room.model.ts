import { Schema, model, Document, Types } from 'mongoose';

export interface IRoom extends Document {
  name: string;
  description: string;
  visibility: 'public' | 'private';
  ownerId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

RoomSchema.index({ name: 'text', description: 'text' });
RoomSchema.index({ visibility: 1 });

export const Room = model<IRoom>('Room', RoomSchema);
