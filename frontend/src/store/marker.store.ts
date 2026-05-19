import { create } from 'zustand';
import {
  createMarker as apiCreateMarker,
  deleteMarker as apiDeleteMarker,
  listMarkers as apiListMarkers,
  type MapMarkerDTO,
} from '../api/marker.api';
import type { MarkerKind } from '../lib/markerKinds';

export type MapMarker = MapMarkerDTO;

interface CreateInput {
  roomId: string;
  kind: MarkerKind;
  label: string;
  description?: string;
  lat: number;
  lng: number;
}

interface MarkerState {
  /** Cached markers keyed by roomId. */
  markersByRoom: Record<string, MapMarker[]>;
  /** True when the initial fetch is in-flight for a given room. */
  loadingByRoom: Record<string, boolean>;

  hydrateRoom: (roomId: string) => Promise<void>;
  upsertMarker: (marker: MapMarker) => void;
  removeMarker: (roomId: string, markerId: string) => void;
  clearRoom: (roomId: string) => void;

  createMarker: (input: CreateInput) => Promise<MapMarker | null>;
  deleteMarker: (roomId: string, markerId: string) => Promise<void>;
}

export const useMarkerStore = create<MarkerState>((set, get) => ({
  markersByRoom: {},
  loadingByRoom: {},

  hydrateRoom: async (roomId) => {
    if (!roomId) return;
    set((s) => ({ loadingByRoom: { ...s.loadingByRoom, [roomId]: true } }));
    try {
      const { data } = await apiListMarkers(roomId);
      set((s) => ({
        markersByRoom: { ...s.markersByRoom, [roomId]: data.markers ?? [] },
      }));
    } catch (err) {
      console.warn('[MarkerStore] hydrate failed:', err);
    } finally {
      set((s) => {
        const next = { ...s.loadingByRoom };
        delete next[roomId];
        return { loadingByRoom: next };
      });
    }
  },

  upsertMarker: (marker) =>
    set((s) => {
      const current = s.markersByRoom[marker.roomId] ?? [];
      const idx = current.findIndex((m) => m._id === marker._id);
      const next =
        idx >= 0
          ? current.map((m, i) => (i === idx ? marker : m))
          : [marker, ...current];
      return { markersByRoom: { ...s.markersByRoom, [marker.roomId]: next } };
    }),

  removeMarker: (roomId, markerId) =>
    set((s) => {
      const current = s.markersByRoom[roomId];
      if (!current) return s;
      return {
        markersByRoom: {
          ...s.markersByRoom,
          [roomId]: current.filter((m) => m._id !== markerId),
        },
      };
    }),

  clearRoom: (roomId) =>
    set((s) => {
      const next = { ...s.markersByRoom };
      delete next[roomId];
      return { markersByRoom: next };
    }),

  createMarker: async (input) => {
    try {
      const { data } = await apiCreateMarker(input);
      // The server will also broadcast `marker_created` over the socket; the
      // socket handler is idempotent (upsertMarker) so this optimistic upsert
      // is safe.
      get().upsertMarker(data.marker);
      return data.marker;
    } catch (err) {
      console.error('[MarkerStore] create failed:', err);
      return null;
    }
  },

  deleteMarker: async (roomId, markerId) => {
    // Optimistically remove; if the API fails we re-fetch the room.
    const prev = get().markersByRoom[roomId];
    set((s) => ({
      markersByRoom: {
        ...s.markersByRoom,
        [roomId]: (s.markersByRoom[roomId] ?? []).filter((m) => m._id !== markerId),
      },
    }));
    try {
      await apiDeleteMarker(markerId);
    } catch (err) {
      console.error('[MarkerStore] delete failed:', err);
      if (prev) {
        set((s) => ({ markersByRoom: { ...s.markersByRoom, [roomId]: prev } }));
      }
    }
  },
}));

