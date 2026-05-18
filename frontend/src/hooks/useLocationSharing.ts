import { useEffect, useRef } from 'react';
import { useLocationStore, type LiveLocation } from '../store/location.store';
import { useNetworkStore } from '../store/network.store';
import { startWatching, stopWatching, distanceMetres } from '../lib/geolocation';
import { enqueue } from '../lib/offlineQueue';
import { socketSingleton } from './useSocket';

interface LocationBatchItem {
  userId?: string;
  username?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  updatedAt?: number;
}

export function useLocationSharing(roomId: string | null) {
  const sharingActive = useLocationStore((s) => s.sharingActive);
  const setCurrentPosition = useLocationStore((s) => s.setCurrentPosition);
  const updateUserLocation = useLocationStore((s) => s.updateUserLocation);
  const isOnline = useNetworkStore((s) => s.isOnline);

  const lastEmitRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  // Listen to location_batch socket events
  useEffect(() => {
    const socket = socketSingleton;
    if (!socket) return;

    const handler = (batch: LocationBatchItem[]) => {
      for (const item of batch) {
        if (!item.userId || typeof item.lat !== 'number' || typeof item.lng !== 'number') continue;
        const loc: LiveLocation = {
          userId: item.userId,
          username: item.username ?? item.userId,
          lat: item.lat,
          lng: item.lng,
          accuracy: item.accuracy ?? 0,
          speed: item.speed ?? null,
          heading: item.heading ?? null,
          updatedAt: item.updatedAt ?? Date.now(),
        };
        updateUserLocation(item.userId, loc);
      }
    };

    socket.on('location_batch', handler);
    return () => {
      socket.off('location_batch', handler);
    };
  }, [updateUserLocation]);

  // Start/stop GPS watching based on sharingActive
  useEffect(() => {
    if (!sharingActive) {
      stopWatching();
      return;
    }

    const onUpdate = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;
      setCurrentPosition(pos.coords);

      const now = Date.now();
      const last = lastEmitRef.current;

      // Throttle: emit if ≥ 5m moved OR ≥ 30s elapsed
      const movedEnough = !last || distanceMetres(last.lat, last.lng, lat, lng) >= 5;
      const enoughTimeElapsed = !last || now - last.time >= 30_000;

      if (!movedEnough && !enoughTimeElapsed) return;

      lastEmitRef.current = { lat, lng, time: now };

      const payload = { lat, lng, accuracy, speed, heading, roomId };

      if (isOnline && socketSingleton?.connected) {
        socketSingleton.emit('location_update', payload);
      } else {
        void enqueue({ type: 'location_update', payload });
      }
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn('[useLocationSharing] Geolocation error:', err.message);
    };

    startWatching(onUpdate, onError);

    return () => {
      stopWatching();
    };
  }, [sharingActive, roomId, isOnline, setCurrentPosition]);
}
