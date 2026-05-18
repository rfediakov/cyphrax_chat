import api from './axios';

export type PrivacyLevel = 'everyone' | 'contacts' | 'nobody';

export interface NotificationPrefs {
  pushEnabled: boolean;
  newMessages: boolean;
  missedCalls: boolean;
  locationRequests: boolean;
  lowBatteryAlerts: boolean;
}

export interface Geofence {
  _id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMetres: number;
  alertOnExit: boolean;
  alertOnEntry: boolean;
}

export interface PrivacySettings {
  privacyLocation: PrivacyLevel;
  privacyBattery: PrivacyLevel;
  privacyOnlineStatus: PrivacyLevel;
  privacyLastSeen: PrivacyLevel;
  privacyProfile: PrivacyLevel;
  notificationPrefs: NotificationPrefs;
  sosMessagePresets: string[];
  emergencyContacts: string[];
  guardianIds: string[];
  autoSosEnabled: boolean;
  autoSosThresholdHours: number;
  restrictedMode: boolean;
  geofences: Geofence[];
  locationSharingActive: boolean;
  locationSharingRooms: string[];
  locationSharingContacts: string[];
  locationHistory: number;
}

export const getPrivacySettings = () =>
  api.get<PrivacySettings>('/privacy/me');

export const updatePrivacy = (data: Partial<Pick<PrivacySettings,
  'privacyLocation' | 'privacyBattery' | 'privacyOnlineStatus' | 'privacyLastSeen' | 'privacyProfile'
>>) => api.patch('/privacy', data);

export const updateNotifications = (data: Partial<NotificationPrefs>) =>
  api.patch<{ notificationPrefs: NotificationPrefs }>('/privacy/notifications', data);

export const updateSafety = (data: {
  sosMessagePresets?: string[];
  autoSosEnabled?: boolean;
  autoSosThresholdHours?: number;
  emergencyContacts?: string[];
}) => api.patch('/privacy/safety', data);

export const updateLocationSettings = (data: {
  locationSharingActive?: boolean;
  locationSharingRooms?: string[];
  locationSharingContacts?: string[];
  locationHistory?: number;
}) => api.patch('/privacy/location', data);

export const addGuardian = (targetUserId: string) =>
  api.post(`/privacy/guardians/${targetUserId}`);

export const removeGuardian = (guardianId: string) =>
  api.delete(`/privacy/guardians/${guardianId}`);

export const setRestrictedMode = (targetUserId: string, enabled: boolean) =>
  api.patch('/privacy/restricted-mode', { targetUserId, enabled });

export const getGeofences = () =>
  api.get<{ geofences: Geofence[] }>('/privacy/geofences');

export const addGeofence = (data: Omit<Geofence, '_id'> & { targetUserId?: string }) =>
  api.post<{ geofences: Geofence[] }>('/privacy/geofences', data);

export const deleteGeofence = (geofenceId: string, targetUserId?: string) =>
  api.delete(`/privacy/geofences/${geofenceId}`, {
    params: targetUserId ? { targetUserId } : undefined,
  });
