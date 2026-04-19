import { create } from 'zustand';
import type { PresenceStatus } from '../components/ui/PresenceDot';

interface PresenceState {
  statuses: Record<string, PresenceStatus>;
  setStatus: (userId: string, status: PresenceStatus) => void;
  bulkSetStatuses: (incoming: Record<string, PresenceStatus>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  statuses: {},
  setStatus: (userId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [userId]: status },
    })),
  bulkSetStatuses: (incoming) =>
    set((state) => ({
      statuses: { ...state.statuses, ...incoming },
    })),
}));
