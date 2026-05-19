import { create } from 'zustand';
import api from '../api/axios';
import { socketSingleton } from '../hooks/useSocket';
import { enqueue } from '../lib/offlineQueue';
import { useAuthStore } from './auth.store';
import { useLocationStore } from './location.store';
import { useNetworkStore } from './network.store';

const DISMISSED_STORAGE_PREFIX = 'sos:dismissed:';

function dismissedStorageKey(userId: string): string {
  return `${DISMISSED_STORAGE_PREFIX}${userId}`;
}

function readDismissedFromStorage(userId: string | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(dismissedStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function writeDismissedToStorage(userId: string | undefined, ids: string[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(dismissedStorageKey(userId), JSON.stringify(ids));
  } catch {
    // Quota / private mode — ignore
  }
}

export interface SOSEvent {
  _id: string;
  roomId: string;
  userId: string;
  username: string;
  lat: number;
  lng: number;
  message: string;
  status: 'active' | 'resolved';
  createdAt: string;
}

interface SOSState {
  myActiveSOSId: string | null;
  activeSOSEvents: SOSEvent[];
  /**
   * IDs of SOS events the current user has dismissed locally. Dismissed alerts
   * are hidden from the alert modal but remain "active" globally — only the
   * victim or a room admin can truly resolve an SOS via the server.
   * Persisted per user in localStorage so dismissals survive refresh.
   */
  dismissedSOSIds: string[];

  triggerSOS: (roomId: string, message?: string) => Promise<void>;
  resolveSOS: (sosId: string) => Promise<void>;
  dismissSOS: (sosId: string) => void;
  addSOSEvent: (event: SOSEvent) => void;
  removeSOSEvent: (sosId: string) => void;
  hydrateFromServer: () => Promise<void>;
}

export const useSOSStore = create<SOSState>((set) => ({
  myActiveSOSId: null,
  activeSOSEvents: [],
  dismissedSOSIds: [],

  triggerSOS: async (roomId, message = "I'm in danger") => {
    const isOnline = useNetworkStore.getState().isOnline;
    const position = useLocationStore.getState().currentPosition;
    const lat = position?.latitude ?? 0;
    const lng = position?.longitude ?? 0;

    const payload = { roomId, lat, lng, message };

    if (!isOnline) {
      // Offline: queue with high priority
      await enqueue({ type: 'sos_trigger', payload });
      // Optimistically update UI
      const tempId = `offline-${Date.now()}`;
      set({ myActiveSOSId: tempId });
      return;
    }

    const socket = socketSingleton;
    if (!socket) return;

    socket.emit('sos_trigger', payload);

    // The server will emit sos_alert back to the room (including sender),
    // which sets myActiveSOSId via addSOSEvent
  },

  resolveSOS: async (sosId) => {
    const isOnline = useNetworkStore.getState().isOnline;

    if (!isOnline) {
      await enqueue({ type: 'sos_resolve', payload: { sosId } });
      set((s) => {
        const activeSOSEvents = s.activeSOSEvents.filter((e) => e._id !== sosId);
        const dismissedSOSIds = s.dismissedSOSIds.filter((id) => id !== sosId);
        writeDismissedToStorage(useAuthStore.getState().user?._id, dismissedSOSIds);
        return { myActiveSOSId: null, activeSOSEvents, dismissedSOSIds };
      });
      return;
    }

    const socket = socketSingleton;
    if (socket) {
      socket.emit('sos_resolve', { sosId });
    } else {
      // Fallback to REST
      try {
        await api.delete(`/sos/${sosId}`);
        set((s) => {
          const activeSOSEvents = s.activeSOSEvents.filter((e) => e._id !== sosId);
          const dismissedSOSIds = s.dismissedSOSIds.filter((id) => id !== sosId);
          writeDismissedToStorage(useAuthStore.getState().user?._id, dismissedSOSIds);
          return { myActiveSOSId: null, activeSOSEvents, dismissedSOSIds };
        });
      } catch (err) {
        console.error('[SOSStore] REST resolve failed:', err);
      }
    }
  },

  dismissSOS: (sosId) => {
    set((s) => {
      if (s.dismissedSOSIds.includes(sosId)) return s;
      const dismissedSOSIds = [...s.dismissedSOSIds, sosId];
      writeDismissedToStorage(useAuthStore.getState().user?._id, dismissedSOSIds);
      return { dismissedSOSIds };
    });
  },

  addSOSEvent: (event) => {
    set((s) => {
      const exists = s.activeSOSEvents.some((e) => e._id === event._id);
      if (exists) return s;

      const uid = useAuthStore.getState().user?._id;
      const wasMemoryDismissed = s.dismissedSOSIds.includes(event._id);

      let dismissedSOSIds: string[];
      if (wasMemoryDismissed) {
        // In-memory replay: show the alert again and drop from storage.
        dismissedSOSIds = s.dismissedSOSIds.filter((id) => id !== event._id);
      } else {
        dismissedSOSIds = s.dismissedSOSIds;
        // Dismissals may exist only in localStorage until hydrate runs — avoid a flash
        // of an alert the user already closed in a prior session/tab.
        if (
          readDismissedFromStorage(uid).includes(event._id) &&
          !dismissedSOSIds.includes(event._id)
        ) {
          dismissedSOSIds = [...dismissedSOSIds, event._id];
        }
      }

      writeDismissedToStorage(uid, dismissedSOSIds);
      return {
        activeSOSEvents: [...s.activeSOSEvents, event],
        dismissedSOSIds,
      };
    });
  },

  removeSOSEvent: (sosId) => {
    set((s) => {
      const dismissedSOSIds = s.dismissedSOSIds.filter((id) => id !== sosId);
      writeDismissedToStorage(useAuthStore.getState().user?._id, dismissedSOSIds);
      return {
        activeSOSEvents: s.activeSOSEvents.filter((e) => e._id !== sosId),
        myActiveSOSId: s.myActiveSOSId === sosId ? null : s.myActiveSOSId,
        dismissedSOSIds,
      };
    });
  },

  hydrateFromServer: async () => {
    try {
      const { data } = await api.get<{ sosEvents: SOSEvent[] }>('/sos');
      set((s) => {
        const activeIds = new Set(data.sosEvents.map((e) => e._id));
        const uid = useAuthStore.getState().user?._id;
        const persisted = readDismissedFromStorage(uid);
        const dismissedSOSIds = Array.from(
          new Set([
            ...persisted.filter((id) => activeIds.has(id)),
            ...s.dismissedSOSIds.filter((id) => activeIds.has(id)),
          ]),
        );
        writeDismissedToStorage(uid, dismissedSOSIds);
        return {
          activeSOSEvents: data.sosEvents,
          dismissedSOSIds,
        };
      });
    } catch (err) {
      console.warn('[SOSStore] Failed to hydrate SOS events:', err);
    }
  },
}));
