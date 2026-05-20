import api from './axios';

export interface LiveLocationDTO {
  userId: string;
  username: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  updatedAt: number;
}

export interface PostLocationPayload {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  roomId?: string | null;
  source?: 'gps' | 'network' | 'passive' | 'manual';
}

export interface SharingPayload {
  active: boolean;
  roomIds?: string[];
}

export const getLiveLocations = (roomId: string) =>
  api.get<{ locations: LiveLocationDTO[] }>('/location/live', { params: { roomId } });

/** All users currently sharing a visible location (app-wide common map). */
export const getGlobalLiveLocations = () =>
  api.get<{ locations: LiveLocationDTO[] }>('/location/live/global');

export const postLocation = (payload: PostLocationPayload) =>
  api.post<{ ok: true }>('/location', payload);

export const updateSharing = (payload: SharingPayload) =>
  api.patch<{ locationSharingActive: boolean; locationSharingRooms: string[] }>(
    '/location/sharing',
    payload,
  );
