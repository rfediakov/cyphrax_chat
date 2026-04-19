import api from './axios';

export interface Session {
  _id: string;
  userAgent: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export const getSessions = () =>
  api.get<{ data: Session[] }>('/sessions');

export const revokeSession = (sessionId: string) =>
  api.delete(`/sessions/${sessionId}`);
