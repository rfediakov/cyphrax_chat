import api from './axios';

export interface IceConfigResponse {
  iceServers: RTCIceServer[];
}

export interface CallRecord {
  _id: string;
  callId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  callerId: { _id: string; username: string } | string;
  calleeId?: { _id: string; username: string } | string;
  duration?: number;
  createdAt: string;
}

export async function fetchIceConfig(): Promise<IceConfigResponse> {
  const { data } = await api.get<IceConfigResponse>('/calls/ice-config');
  return data;
}

export async function fetchCallHistory(limit = 20, offset = 0): Promise<CallRecord[]> {
  const { data } = await api.get<{ calls: CallRecord[] }>('/calls/history', {
    params: { limit, offset },
  });
  return data.calls;
}
