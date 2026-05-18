import api from './axios';

export interface Ward {
  _id: string;
  username: string;
  email: string;
  restrictedMode: boolean;
  lastActivityAt: string | null;
}

export interface AccessLogEntry {
  _id: string;
  requester: { _id: string; username: string };
  target: { _id: string; username: string };
  requestedAt: string;
  consentGiven: boolean;
  consentDuration: number | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  endedBy: 'requester' | 'target' | 'timeout' | null;
}

export const getWards = () => api.get<{ wards: Ward[] }>('/remote/wards');

export const getAccessLog = (role?: 'guardian' | 'target', limit = 50) =>
  api.get<{ logs: AccessLogEntry[] }>('/remote/access-log', {
    params: { role, limit },
  });

export const getWardAccessLog = (targetUserId: string, limit = 50) =>
  api.get<{ logs: AccessLogEntry[] }>(`/remote/access-log/${targetUserId}`, {
    params: { limit },
  });
