import { create } from 'zustand';
import api from '../api/axios';
import { socketSingleton } from '../hooks/useSocket';
import { enqueue } from '../lib/offlineQueue';
import { useLocationStore } from './location.store';
import { useNetworkStore } from './network.store';

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
      set({ myActiveSOSId: null });
      set((s) => ({
        activeSOSEvents: s.activeSOSEvents.filter((e) => e._id !== sosId),
      }));
      return;
    }

    const socket = socketSingleton;
    if (socket) {
      socket.emit('sos_resolve', { sosId });
    } else {
      // Fallback to REST
      try {
        await api.delete(`/sos/${sosId}`);
        set({ myActiveSOSId: null });
        set((s) => ({
          activeSOSEvents: s.activeSOSEvents.filter((e) => e._id !== sosId),
        }));
      } catch (err) {
        console.error('[SOSStore] REST resolve failed:', err);
      }
    }
  },

  dismissSOS: (sosId) => {
    set((s) =>
      s.dismissedSOSIds.includes(sosId)
        ? s
        : { dismissedSOSIds: [...s.dismissedSOSIds, sosId] },
    );
  },

  addSOSEvent: (event) => {
    set((s) => {
      const exists = s.activeSOSEvents.some((e) => e._id === event._id);
      if (exists) return s;
      // If a previously-dismissed id reappears (e.g. server replay), clear its
      // dismissal so the user sees it again.
      const dismissedSOSIds = s.dismissedSOSIds.includes(event._id)
        ? s.dismissedSOSIds.filter((id) => id !== event._id)
        : s.dismissedSOSIds;
      return {
        activeSOSEvents: [...s.activeSOSEvents, event],
        dismissedSOSIds,
      };
    });
  },

  removeSOSEvent: (sosId) => {
    set((s) => ({
      activeSOSEvents: s.activeSOSEvents.filter((e) => e._id !== sosId),
      myActiveSOSId: s.myActiveSOSId === sosId ? null : s.myActiveSOSId,
      dismissedSOSIds: s.dismissedSOSIds.filter((id) => id !== sosId),
    }));
  },

  hydrateFromServer: async () => {
    try {
      const { data } = await api.get<{ sosEvents: SOSEvent[] }>('/sos');
      set((s) => {
        const activeIds = new Set(data.sosEvents.map((e) => e._id));
        return {
          activeSOSEvents: data.sosEvents,
          dismissedSOSIds: s.dismissedSOSIds.filter((id) => activeIds.has(id)),
        };
      });
    } catch (err) {
      console.warn('[SOSStore] Failed to hydrate SOS events:', err);
    }
  },
}));
