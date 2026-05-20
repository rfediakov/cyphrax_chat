import { useEffect } from 'react';
import { useMarkerStore } from '../store/marker.store';

/**
 * Hydrate the marker store for a given room and clean up on unmount.
 * The socket subscriber (in `useSocket`) keeps the cache in sync with
 * `marker_created`, `marker_updated` and `marker_deleted` events.
 *
 * Pass `null` to skip — useful while no room is selected yet.
 */
export function useRoomMarkers(roomId: string | null): void {
  const hydrateRoom = useMarkerStore((s) => s.hydrateRoom);

  useEffect(() => {
    if (!roomId) return;
    void hydrateRoom(roomId);
  }, [roomId, hydrateRoom]);
}
