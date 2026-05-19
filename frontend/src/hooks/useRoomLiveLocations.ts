import { useEffect } from 'react';
import { getLiveLocations } from '../api/location.api';
import { useLocationStore, type LiveLocation } from '../store/location.store';

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

/**
 * Hydrate and maintain `userLocations` in the location store for everyone
 * sharing in a room. The socket already pushes `location_batch` events; this
 * hook just adds the initial fetch so a freshly opened chat/map screen sees
 * peers immediately (without having to wait for the next throttled emit).
 *
 * Pass `null` to skip — useful while no room is selected yet.
 */
export function useRoomLiveLocations(roomId: string | null): void {
  const updateUserLocation = useLocationStore((s) => s.updateUserLocation);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await getLiveLocations(roomId);
        if (cancelled) return;
        for (const raw of data.locations ?? []) {
          const item = raw as LocationBatchItem;
          if (!item.userId || typeof item.lat !== 'number' || typeof item.lng !== 'number') {
            continue;
          }
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
      } catch (err) {
        // Non-fatal: socket will deliver updates as they happen.
        console.warn('[useRoomLiveLocations] initial fetch failed:', err);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [roomId, updateUserLocation]);
}
