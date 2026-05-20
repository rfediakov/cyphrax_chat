import { useCallback, useState } from 'react';
import {
  useLocationStore,
  coordsToOwnPosition,
  type OwnPosition,
} from '../store/location.store';
import { useNetworkStore } from '../store/network.store';
import {
  getCurrentPosition,
  isGeolocationSupported,
  queryGeolocationPermission,
} from '../lib/geolocation';
import { postLocation, updateSharing } from '../api/location.api';
import { enqueue } from '../lib/offlineQueue';
import { socketSingleton } from './useSocket';

export type LocationPermissionState =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported';

interface UseMyLocationApi {
  permission: LocationPermissionState;
  pending: boolean;
  error: string | null;
  /** Refresh the cached permission state from the Permissions API. */
  refreshPermission: () => Promise<LocationPermissionState>;
  /**
   * Request a one-shot fix from the OS (Wi-Fi/cell/GPS). Centers the map by
   * writing to the location store and emits the new position upstream so
   * peers see it on their maps.
   */
  requestAndShareCurrent: (roomId?: string | null) => Promise<OwnPosition | null>;
  /**
   * Set the current position manually (e.g. from a map click). Bypasses
   * geolocation APIs entirely. Sharing is enabled implicitly so the pin is
   * visible to peers.
   */
  setManualPosition: (
    lat: number,
    lng: number,
    roomId?: string | null,
  ) => Promise<OwnPosition>;
}

/**
 * Pure orchestration hook: handles permission prompts, GPS fixes, manual map
 * clicks, and the wire-up to the socket / REST so a peer sees the update.
 *
 * Does NOT render anything; UI components decide how to use it.
 */
export function useMyLocation(): UseMyLocationApi {
  const setCurrentPosition = useLocationStore((s) => s.setCurrentPosition);
  const setSharingActive = useLocationStore((s) => s.setSharingActive);

  const [permission, setPermission] = useState<LocationPermissionState>('unknown');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPermission = useCallback(async (): Promise<LocationPermissionState> => {
    if (!isGeolocationSupported()) {
      setPermission('unsupported');
      return 'unsupported';
    }
    const state = await queryGeolocationPermission();
    const next: LocationPermissionState = state ?? 'unknown';
    setPermission(next);
    return next;
  }, []);

  /**
   * Ship an OwnPosition to the server. Prefers the live socket (less overhead,
   * fan-out to all rooms the user is in) and falls back to REST when
   * disconnected. Both paths fall through to the offline queue when the
   * device is offline.
   */
  const broadcast = useCallback(
    async (pos: OwnPosition, roomId?: string | null, source?: 'gps' | 'manual') => {
      const payload = {
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        speed: pos.speed,
        heading: pos.heading,
        roomId: roomId ?? null,
      };

      const isOnline = useNetworkStore.getState().isOnline;
      if (!isOnline) {
        await enqueue({ type: 'location_update', payload });
        return;
      }

      if (socketSingleton?.connected) {
        socketSingleton.emit('location_update', payload);
        return;
      }

      try {
        await postLocation({ ...payload, source: source ?? 'gps' });
      } catch (err) {
        console.warn('[useMyLocation] REST fallback failed, queuing:', err);
        await enqueue({ type: 'location_update', payload });
      }
    },
    [],
  );

  const requestAndShareCurrent = useCallback(
    async (roomId?: string | null): Promise<OwnPosition | null> => {
      setError(null);

      if (!isGeolocationSupported()) {
        setPermission('unsupported');
        setError('Geolocation is not supported on this device.');
        return null;
      }

      setPending(true);
      try {
        const pos = await getCurrentPosition();
        const own = coordsToOwnPosition(pos.coords, 'gps');
        setCurrentPosition(own);
        setPermission('granted');

        // Auto-enable sharing so the broadcast actually fans out — the user
        // explicitly asked for "show me on the map", which implies sharing.
        try {
          await updateSharing({ active: true });
          setSharingActive(true);
        } catch (err) {
          console.warn('[useMyLocation] failed to enable sharing:', err);
        }

        await broadcast(own, roomId, 'gps');
        return own;
      } catch (err) {
        const geoErr = err as GeolocationPositionError;
        if (geoErr && geoErr.code === geoErr.PERMISSION_DENIED) {
          setPermission('denied');
          setError('Location permission denied. Enable it in your browser settings.');
        } else {
          setError(geoErr?.message ?? 'Failed to get current location.');
        }
        return null;
      } finally {
        setPending(false);
      }
    },
    [setCurrentPosition, setSharingActive, broadcast],
  );

  const setManualPosition = useCallback(
    async (lat: number, lng: number, roomId?: string | null): Promise<OwnPosition> => {
      setError(null);

      const own: OwnPosition = {
        latitude: lat,
        longitude: lng,
        accuracy: 0,
        speed: null,
        heading: null,
        altitude: null,
        source: 'manual',
        updatedAt: Date.now(),
      };

      setCurrentPosition(own);

      // Manual placement always implies "share me here".
      try {
        await updateSharing({ active: true });
        setSharingActive(true);
      } catch (err) {
        console.warn('[useMyLocation] failed to enable sharing for manual point:', err);
      }

      await broadcast(own, roomId, 'manual');
      return own;
    },
    [setCurrentPosition, setSharingActive, broadcast],
  );

  return {
    permission,
    pending,
    error,
    refreshPermission,
    requestAndShareCurrent,
    setManualPosition,
  };
}
