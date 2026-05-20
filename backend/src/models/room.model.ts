import { Schema, model, Document, Types } from 'mongoose';

/**
 * SafeGroup — typed rooms.
 *
 * Every room knows what *kind* of app it is. `chat` is the legacy default and
 * the fallback for any unknown/legacy value the frontend may receive. New types
 * are added here and surfaced through the frontend `RoomBlueprint` registry.
 */
export const ROOM_TYPES = [
  'chat',
  'radio_mesh',
  'fm_tuner',
  'music_jukebox',
  'dating',
  'parental',
  'watch_party',
  'sports',
  'news',
  'market',
  'study',
  'game',
  'sos',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export function isRoomType(value: unknown): value is RoomType {
  return typeof value === 'string' && (ROOM_TYPES as readonly string[]).includes(value);
}

export interface IRoom extends Document {
  name: string;
  description: string;
  visibility: 'public' | 'private';
  ownerId: Types.ObjectId;
  /** Typed-room family this room belongs to. Defaults to `chat`. */
  type: RoomType;
  /** Per-type free-form configuration blob, edited by admins. */
  config: Record<string, unknown>;
  /** True for default rooms seeded by the system. Cannot be deleted by ordinary admins. */
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ROOM_TYPES, default: 'chat', index: true },
    config: { type: Schema.Types.Mixed, default: {} },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

RoomSchema.index({ name: 'text', description: 'text' });
RoomSchema.index({ visibility: 1 });

export const Room = model<IRoom>('Room', RoomSchema);
