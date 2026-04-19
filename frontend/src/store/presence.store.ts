import { create } from 'zustand';

type PresenceStatus = 'online' | 'afk' | 'offline';

interface PresenceState {
  statuses: Record<string, PresenceStatus>;
  setStatus: (userId: string, status: PresenceStatus) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  statuses: {},
  setStatus: (userId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [userId]: status },
    })),
}));
