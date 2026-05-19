import { create } from 'zustand';

export interface LiveLocation {
  userId: string;
  username: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  updatedAt: number; // Date.now() timestamp
}

/**
 * Subset of GeolocationCoordinates used for our own position. We deliberately
 * do NOT type this as `GeolocationCoordinates` because that type is read-only
 * and constructed by the browser; we need a plain object we can build from
 * manual map clicks too.
 */
export interface OwnPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  /** 'gps' for live GPS/Wi-Fi/cell readings, 'manual' for map-clicked pins */
  source: 'gps' | 'manual';
  updatedAt: number;
}

interface LocationState {
  sharingActive: boolean;
  currentPosition: OwnPosition | null;
  userLocations: Record<string, LiveLocation>; // userId → latest

  setSharingActive: (active: boolean) => void;
  setCurrentPosition: (pos: OwnPosition | null) => void;
  updateUserLocation: (userId: string, loc: LiveLocation) => void;
  removeUserLocation: (userId: string) => void;
  clearUserLocations: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  sharingActive: false,
  currentPosition: null,
  userLocations: {},
  setSharingActive: (sharingActive) => set({ sharingActive }),
  setCurrentPosition: (pos) => set({ currentPosition: pos }),
  updateUserLocation: (userId, loc) =>
    set((s) => ({ userLocations: { ...s.userLocations, [userId]: loc } })),
  removeUserLocation: (userId) =>
    set((s) => {
      const next = { ...s.userLocations };
      delete next[userId];
      return { userLocations: next };
    }),
  clearUserLocations: () => set({ userLocations: {} }),
}));

export function coordsToOwnPosition(
  coords: GeolocationCoordinates,
  source: OwnPosition['source'] = 'gps',
): OwnPosition {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speed: coords.speed,
    heading: coords.heading,
    altitude: coords.altitude,
    source,
    updatedAt: Date.now(),
  };
}
