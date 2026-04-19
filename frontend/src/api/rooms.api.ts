import api from './axios';
import type { Room } from '../store/chat.store';

export interface PublicRoomsParams {
  q?: string;
  page?: number;
}

export interface PublicRoomsResponse {
  rooms: Room[];
  total: number;
}

export interface CreateRoomPayload {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export interface UpdateRoomPayload {
  name?: string;
  description?: string;
  isPrivate?: boolean;
}

export const getPublicRooms = (params?: PublicRoomsParams) =>
  api.get<PublicRoomsResponse>('/rooms/public', { params });

export const createRoom = (payload: CreateRoomPayload) =>
  api.post<{ room: Room }>('/rooms', payload);

export const getRoom = (id: string) => api.get<{ room: Room }>(`/rooms/${id}`);

export const updateRoom = (id: string, payload: UpdateRoomPayload) =>
  api.put<Room>(`/rooms/${id}`, payload);

export const deleteRoom = (id: string) => api.delete(`/rooms/${id}`);

export const joinRoom = (id: string) => api.post(`/rooms/${id}/join`);

export const leaveRoom = (id: string) => api.delete(`/rooms/${id}/leave`);

export const getMembers = (id: string) =>
  api.get<{ members: unknown[] }>(`/rooms/${id}/members`);

export const promoteAdmin = (roomId: string, userId: string) =>
  api.post(`/rooms/${roomId}/admins/${userId}`);

export const demoteAdmin = (roomId: string, userId: string) =>
  api.delete(`/rooms/${roomId}/admins/${userId}`);

export const banMember = (roomId: string, userId: string) =>
  api.post(`/rooms/${roomId}/ban/${userId}`);

export const unbanMember = (roomId: string, userId: string) =>
  api.delete(`/rooms/${roomId}/ban/${userId}`);

export const getBans = (roomId: string) =>
  api.get<{ data: unknown[] }>(`/rooms/${roomId}/bans`);

export const sendInvitation = (roomId: string, username: string) =>
  api.post(`/rooms/${roomId}/invitations`, { username });

export const respondToInvitation = (
  roomId: string,
  invId: string,
  action: 'accept' | 'reject'
) => api.put(`/rooms/${roomId}/invitations/${invId}`, { action });
