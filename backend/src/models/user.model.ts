import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  email: string;
  username: string;
  passwordHash: string;
  deletedAt: Date | null;
  locationSharingActive: boolean;
  locationSharingRooms: Types.ObjectId[];
  privacyLocation: 'everyone' | 'contacts' | 'nobody';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, immutable: true },
    passwordHash: { type: String, required: true },
    deletedAt: { type: Date, default: null },
    locationSharingActive: { type: Boolean, default: false },
    locationSharingRooms: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
    privacyLocation: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'nobody' },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', UserSchema);
