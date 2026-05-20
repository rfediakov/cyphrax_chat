import { useEffect, useRef } from 'react';
import { getBattery, watchBattery, type BatteryInfo } from '../lib/batteryStatus';
import { getNetworkInfo, watchNetworkInfo, type NetworkInfo } from '../lib/networkStatus';
import { postTelemetry, getLiveTelemetry } from '../api/telemetry.api';
import { enqueue } from '../lib/offlineQueue';
import { useTelemetryStore } from '../store/telemetry.store';
import { socketSingleton } from './useSocket';
import type { LiveTelemetryEntry } from '../api/telemetry.api';

const EMIT_INTERVAL_MS = 30_000;

export function useTelemetry(activeRoomId: string | null) {
  const upsert = useTelemetryStore((s) => s.upsert);
  const bulkSet = useTelemetryStore((s) => s.bulkSet);

  // Latest readings stored in refs to avoid stale closure in setInterval
  const batteryRef = useRef<BatteryInfo | null>(null);
  const networkRef = useRef<NetworkInfo>(getNetworkInfo());

  async function send() {
    const battery = batteryRef.current;
    const network = networkRef.current;

    const payload = {
      battery,
      network,
      recordedAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      await enqueue({ type: 'telemetry_update', payload }).catch(() => {});
      return;
    }

    try {
      await postTelemetry(payload);

      // Emit via socket for instant peer update (fire-and-forget)
      socketSingleton?.emit('telemetry_update', payload);
    } catch {
      await enqueue({ type: 'telemetry_update', payload }).catch(() => {});
    }
  }

  // Load initial room telemetry when active room changes
  useEffect(() => {
    if (!activeRoomId) return;

    getLiveTelemetry(activeRoomId)
      .then(bulkSet)
      .catch(() => {});
  }, [activeRoomId, bulkSet]);

  // Listen for telemetry_update events from peers.
  // Without an explicit dependency array this effect runs on every render,
  // attaching and tearing down the socket listener on every commit. Pin it
  // to the values it actually depends on.
  useEffect(() => {
    const socket = socketSingleton;
    if (!socket) return;

    function handleTelemetryUpdate(entry: LiveTelemetryEntry) {
      upsert(entry);
    }

    socket.on('telemetry_update', handleTelemetryUpdate);
    return () => {
      socket.off('telemetry_update', handleTelemetryUpdate);
    };
  }, [upsert]);

  // Battery watcher
  useEffect(() => {
    getBattery().then((info) => {
      batteryRef.current = info;
    });

    const unwatch = watchBattery((info) => {
      batteryRef.current = info;
      void send();
    });

    return unwatch;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Network watcher
  useEffect(() => {
    networkRef.current = getNetworkInfo();

    const unwatch = watchNetworkInfo((info) => {
      networkRef.current = info;
      void send();
    });

    return unwatch;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic 30s emit
  useEffect(() => {
    void send();
    const id = setInterval(() => void send(), EMIT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
