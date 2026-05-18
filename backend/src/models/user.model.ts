import { Schema, model, Document, Types } from 'mongoose';

export type PrivacyLevel = 'everyone' | 'contacts' | 'nobody';

export interface IGeofence {
  name: string;
  lat: number;
  lng: number;
  radiusMetres: number;
  alertOnExit: boolean;
  alertOnEntry: boolean;
}

export interface INotificationPrefs {
  pushEnabled: boolean;
  newMessages: boolean;
  missedCalls: boolean;
  locationRequests: boolean;
  lowBatteryAlerts: boolean;
}

export interface IUser extends Document {
  email: string;
  username: string;
  passwordHash: string;
  deletedAt: Date | null;

  // Location sharing
  locationSharingActive: boolean;
  locationSharingRooms: Types.ObjectId[];
  locationSharingContacts: Types.ObjectId[];
  locationHistory: number; // days to retain

  // Privacy settings
  privacyLocation: PrivacyLevel;
  privacyBattery: PrivacyLevel;
  privacyOnlineStatus: PrivacyLevel;
  privacyLastSeen: PrivacyLevel;
  privacyProfile: PrivacyLevel;

  // Notification preferences
  notificationPrefs: INotificationPrefs;

  // Safety
  sosMessagePresets: string[];
  emergencyContacts: Types.ObjectId[];
  guardianIds: Types.ObjectId[];
  autoSosEnabled: boolean;
  autoSosThresholdHours: number;
  lastActivityAt: Date;

  // Parental / restricted mode
  restrictedMode: boolean;

  // Geofences (set by guardians)
  geofences: IGeofence[];

  createdAt: Date;
  updatedAt: Date;
}

const GeofenceSchema = new Schema<IGeofence>(
  {
    name: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radiusMetres: { type: Number, required: true, min: 10 },
    alertOnExit: { type: Boolean, default: true },
    alertOnEntry: { type: Boolean, default: false },
  },
  { _id: true },
);

const NotificationPrefsSchema = new Schema<INotificationPrefs>(
  {
    pushEnabled: { type: Boolean, default: true },
    newMessages: { type: Boolean, default: true },
    missedCalls: { type: Boolean, default: true },
    locationRequests: { type: Boolean, default: true },
    lowBatteryAlerts: { type: Boolean, default: true },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, immutable: true },
    passwordHash: { type: String, required: true },
    deletedAt: { type: Date, default: null },

    // Location sharing
    locationSharingActive: { type: Boolean, default: false },
    locationSharingRooms: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
    locationSharingContacts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    locationHistory: { type: Number, default: 30 },

    // Privacy settings
    privacyLocation: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'nobody' },
    privacyBattery: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'nobody' },
    privacyOnlineStatus: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'everyone' },
    privacyLastSeen: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'contacts' },
    privacyProfile: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'everyone' },

    // Notification preferences
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },

    // Safety
    sosMessagePresets: [{ type: String }],
    emergencyContacts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    guardianIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    autoSosEnabled: { type: Boolean, default: false },
    autoSosThresholdHours: { type: Number, default: 2 },
    lastActivityAt: { type: Date, default: Date.now },

    // Parental / restricted mode
    restrictedMode: { type: Boolean, default: false },

    // Geofences
    geofences: [GeofenceSchema],
  },
  { timestamps: true },
);

export const User = model<IUser>('User', UserSchema);
