import api from './axios';
import type { MarkerKind } from '../lib/markerKinds';

export interface MapMarkerDTO {
  _id: string;
  roomId: string;
  userId: string;
  username: string;
  kind: MarkerKind;
  label: string;
  description: string;
  lat: number;
  lng: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMarkerPayload {
  roomId: string;
  kind: MarkerKind;
  label: string;
  description?: string;
  lat: number;
  lng: number;
  color?: string | null;
}

export interface UpdateMarkerPayload {
  kind?: MarkerKind;
  label?: string;
  description?: string;
  color?: string | null;
}

export const listMarkers = (roomId: string) =>
  api.get<{ markers: MapMarkerDTO[] }>('/markers', { params: { roomId } });

export const createMarker = (payload: CreateMarkerPayload) =>
  api.post<{ marker: MapMarkerDTO }>('/markers', payload);

export const updateMarker = (id: string, payload: UpdateMarkerPayload) =>
  api.patch<{ marker: MapMarkerDTO }>(`/markers/${id}`, payload);

export const deleteMarker = (id: string) => api.delete<{ ok: true }>(`/markers/${id}`);
