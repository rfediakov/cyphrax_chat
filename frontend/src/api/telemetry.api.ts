import api from './axios';
import type { BatteryInfo } from '../lib/batteryStatus';
import type { NetworkInfo } from '../lib/networkStatus';

export interface TelemetryPayload {
  battery: BatteryInfo | null;
  network: NetworkInfo;
  recordedAt: string;
}

export interface LiveTelemetryEntry {
  userId: string;
  username: string;
  battery: {
    level: number | null;
    charging: boolean | null;
    chargingTime: number | null;
    dischargingTime: number | null;
  } | null;
  network: {
    online: boolean;
    effectiveType: string;
    downlink: number | null;
    saveData: boolean;
  } | null;
  recordedAt: string;
}

export function postTelemetry(payload: TelemetryPayload): Promise<void> {
  return api.post('/telemetry', payload).then(() => undefined);
}

export function getLiveTelemetry(roomId: string): Promise<LiveTelemetryEntry[]> {
  return api
    .get<{ telemetry: LiveTelemetryEntry[] }>('/telemetry/live', { params: { roomId } })
    .then((res) => res.data.telemetry);
}
