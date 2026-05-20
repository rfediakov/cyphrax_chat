import { useEffect } from 'react';
import { getGlobalLiveLocations } from '../api/location.api';
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

function itemToLocation(raw: LocationBatchItem): LiveLocation | null {
  if (!raw.userId || typeof raw.lat !== 'number' || typeof raw.lng !== 'number') {
    return null;
  }
  return {
    userId: raw.userId,
    username: raw.username ?? raw.userId,
    lat: raw.lat,
    lng: raw.lng,
    accuracy: raw.accuracy ?? 0,
    speed: raw.speed ?? null,
    heading: raw.heading ?? null,
    updatedAt: raw.updatedAt ?? Date.now(),
  };
}

/**
 * Hydrates the location store with every shareable user on the common map.
 * Socket `location_batch` events (including app:map fan-out) keep positions fresh.
 */
export function useGlobalLiveLocations(enabled = true): void {
  const updateUserLocation = useLocationStore((s) => s.updateUserLocation);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await getGlobalLiveLocations();
        if (cancelled) return;
        for (const raw of data.locations ?? []) {
          const loc = itemToLocation(raw as LocationBatchItem);
          if (loc) updateUserLocation(loc.userId, loc);
        }
      } catch (err) {
        console.warn('[useGlobalLiveLocations] initial fetch failed:', err);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, updateUserLocation]);
}
