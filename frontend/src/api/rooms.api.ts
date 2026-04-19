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

// The backend returns { id, visibility, ownerId, ... } — normalize to the Room store shape
export function normalizeRoom(raw: Record<string, unknown>): Room {
  return {
    _id: (raw.id ?? raw._id) as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    isPrivate: raw.isPrivate !== undefined ? (raw.isPrivate as boolean) : raw.visibility === 'private',
    owner: (raw.owner ?? raw.ownerId) as string,
    memberCount: raw.memberCount as number | undefined,
    unreadCount: raw.unreadCount as number | undefined,
  };
}

export interface CreateRoomPayload {
  name: string;
  description?: string;
  visibility?: 'public' | 'private';
}

export interface UpdateRoomPayload {
  name?: string;
  description?: string;
  visibility?: 'public' | 'private';
}

export const getMyRooms = () =>
  api.get<{ rooms: Room[] }>('/rooms/mine');

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

export interface NormalizedMember {
  _id: string;
  userId: { _id: string; username: string };
  role: 'owner' | 'admin' | 'member';
}

export interface NormalizedBan {
  _id: string;
  userId: { _id: string; username: string };
  bannedBy?: { _id: string; username: string };
  createdAt: string;
}

// Backend returns { id, user: { id, username }, role } — normalize to frontend shape
export function normalizeMember(raw: Record<string, unknown>): NormalizedMember {
  const user = (raw.user ?? raw.userId) as Record<string, unknown>;
  return {
    _id: (raw.id ?? raw._id) as string,
    userId: {
      _id: (user?.id ?? user?._id) as string,
      username: user?.username as string,
    },
    role: raw.role as NormalizedMember['role'],
  };
}

// Backend returns { id, user: { id, username }, bannedBy: { id, username }, bannedAt }
export function normalizeBan(raw: Record<string, unknown>): NormalizedBan {
  const user = (raw.user ?? raw.userId) as Record<string, unknown>;
  const bannedBy = raw.bannedBy as Record<string, unknown> | undefined;
  return {
    _id: (raw.id ?? raw._id) as string,
    userId: {
      _id: (user?.id ?? user?._id) as string,
      username: user?.username as string,
    },
    bannedBy: bannedBy
      ? { _id: (bannedBy.id ?? bannedBy._id) as string, username: bannedBy.username as string }
      : undefined,
    createdAt: (raw.bannedAt ?? raw.createdAt) as string,
  };
}

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
  api.get<{ bans: unknown[] }>(`/rooms/${roomId}/bans`);

export const sendInvitation = (roomId: string, username: string) =>
  api.post(`/rooms/${roomId}/invitations`, { username });

export const respondToInvitation = (
  roomId: string,
  invId: string,
  action: 'accept' | 'reject'
) => api.put(`/rooms/${roomId}/invitations/${invId}`, { action });
