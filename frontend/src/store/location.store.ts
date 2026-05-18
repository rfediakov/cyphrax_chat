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

interface LocationState {
  sharingActive: boolean;
  currentPosition: GeolocationCoordinates | null;
  userLocations: Record<string, LiveLocation>; // userId → latest

  setSharingActive: (active: boolean) => void;
  setCurrentPosition: (coords: GeolocationCoordinates) => void;
  updateUserLocation: (userId: string, loc: LiveLocation) => void;
  removeUserLocation: (userId: string) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  sharingActive: false,
  currentPosition: null,
  userLocations: {},
  setSharingActive: (sharingActive) => set({ sharingActive }),
  setCurrentPosition: (coords) => set({ currentPosition: coords }),
  updateUserLocation: (userId, loc) =>
    set((s) => ({ userLocations: { ...s.userLocations, [userId]: loc } })),
  removeUserLocation: (userId) =>
    set((s) => {
      const next = { ...s.userLocations };
      delete next[userId];
      return { userLocations: next };
    }),
}));
