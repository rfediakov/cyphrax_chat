import { useEffect } from 'react';
import { create } from 'zustand';
import { socketSingleton } from '../../hooks/useSocket';
import {
  getQueue as fetchQueue,
  type JukeboxTrack,
} from '../../api/jukebox.api';

/**
 * Per-room slice of Music Jukebox state shared between `JukeboxNowStrip`
 * (always mounted while the room is open) and `JukeboxPanel` (mounted from
 * the right sidebar). One store keyed by `roomId` so both components observe
 * the same truth and we only run one socket subscription per room.
 *
 * Mirrors the FM tuner store layout so future read-side fixes can land in
 * both places with the same shape.
 */

export interface JukeboxRoomState {
  playing: JukeboxTrack | null;
  queue: JukeboxTrack[];
  memberCount: number;
  loaded: boolean;
  /** Increments whenever a `track_changed` event arrives. The NowStrip uses
   *  this as a trigger to swap the audio `<source>` regardless of identity. */
  trackTick: number;
  /** Most recent `room_widget:juke:skip_voted` payload, used so the NowStrip
   *  can show "X of Y skipped" without re-fetching. */
  skipRatio: { votes: number; total: number } | null;
}

interface JukeboxStoreState {
  rooms: Record<string, JukeboxRoomState>;
  setRoomState: (roomId: string, patch: Partial<JukeboxRoomState>) => void;
  applyQueue: (
    roomId: string,
    playing: JukeboxTrack | null,
    queue: JukeboxTrack[],
  ) => void;
  applyTrackChange: (roomId: string, playing: JukeboxTrack | null) => void;
  applySkipRatio: (
    roomId: string,
    ratio: { votes: number; total: number },
  ) => void;
}

const emptyRoom: JukeboxRoomState = {
  playing: null,
  queue: [],
  memberCount: 0,
  loaded: false,
  trackTick: 0,
  skipRatio: null,
};

export const useJukeboxStore = create<JukeboxStoreState>((set) => ({
  rooms: {},
  setRoomState: (roomId, patch) =>
    set((state) => ({
      rooms: {
        ...state.rooms,
        [roomId]: { ...(state.rooms[roomId] ?? emptyRoom), ...patch },
      },
    })),
  applyQueue: (roomId, playing, queue) =>
    set((state) => {
      const prev = state.rooms[roomId] ?? emptyRoom;
      const trackIdChanged = prev.playing?.id !== (playing?.id ?? null);
      return {
        rooms: {
          ...state.rooms,
          [roomId]: {
            ...prev,
            playing,
            queue,
            trackTick: trackIdChanged ? prev.trackTick + 1 : prev.trackTick,
          },
        },
      };
    }),
  applyTrackChange: (roomId, playing) =>
    set((state) => {
      const prev = state.rooms[roomId] ?? emptyRoom;
      return {
        rooms: {
          ...state.rooms,
          [roomId]: { ...prev, playing, trackTick: prev.trackTick + 1, skipRatio: null },
        },
      };
    }),
  applySkipRatio: (roomId, ratio) =>
    set((state) => ({
      rooms: {
        ...state.rooms,
        [roomId]: { ...(state.rooms[roomId] ?? emptyRoom), skipRatio: ratio },
      },
    })),
}));

/** Hook returning the cached state for `roomId`. */
export function useJukeboxRoomState(roomId: string): JukeboxRoomState {
  return useJukeboxStore((s) => s.rooms[roomId] ?? emptyRoom);
}

// ── Per-room subscription manager ──────────────────────────────────────────
// Both NowStrip and Panel call `useJukeboxRoomSubscription(roomId)`. The first
// caller (per roomId) fetches the initial state and wires up socket
// listeners; subsequent callers piggy-back via a ref-count. When the last
// subscriber unmounts we tear everything down.

interface RoomSub {
  refCount: number;
  cleanup: () => void;
}

const activeSubs = new Map<string, RoomSub>();

interface QueueUpdatedPayload {
  roomId: string;
  playing: JukeboxTrack | null;
  queue: JukeboxTrack[];
}

interface TrackChangedPayload {
  roomId: string;
  playing: JukeboxTrack | null;
}

interface SkipVotedPayload {
  roomId: string;
  trackId: string | null;
  ratio: { votes: number; total: number };
  advanced: boolean;
}

function startSubscription(roomId: string): () => void {
  const store = useJukeboxStore.getState();

  // Initial hydration — non-blocking, errors are silent (the user can still
  // interact and the next socket event will fill state in).
  void fetchQueue(roomId)
    .then((res) => {
      store.setRoomState(roomId, {
        playing: res.data.playing,
        queue: res.data.queue,
        memberCount: res.data.memberCount ?? 0,
        loaded: true,
      });
    })
    .catch(() => {
      store.setRoomState(roomId, { loaded: true });
    });

  const socket = socketSingleton;
  if (!socket) {
    return () => undefined;
  }

  const onQueueUpdated = (payload: QueueUpdatedPayload) => {
    if (payload.roomId !== roomId) return;
    store.applyQueue(roomId, payload.playing, payload.queue);
  };

  const onTrackChanged = (payload: TrackChangedPayload) => {
    if (payload.roomId !== roomId) return;
    store.applyTrackChange(roomId, payload.playing);
  };

  const onSkipVoted = (payload: SkipVotedPayload) => {
    if (payload.roomId !== roomId) return;
    store.applySkipRatio(roomId, payload.ratio);
  };

  socket.on('room_widget:juke:queue_updated', onQueueUpdated);
  socket.on('room_widget:juke:track_changed', onTrackChanged);
  socket.on('room_widget:juke:skip_voted', onSkipVoted);

  return () => {
    socket.off('room_widget:juke:queue_updated', onQueueUpdated);
    socket.off('room_widget:juke:track_changed', onTrackChanged);
    socket.off('room_widget:juke:skip_voted', onSkipVoted);
  };
}

/** Mount-time hook that wires socket listeners + initial fetch for `roomId`. */
export function useJukeboxRoomSubscription(roomId: string | null | undefined): void {
  useEffect(() => {
    if (!roomId) return;

    const existing = activeSubs.get(roomId);
    if (existing) {
      existing.refCount += 1;
      return () => {
        existing.refCount -= 1;
        if (existing.refCount <= 0) {
          existing.cleanup();
          activeSubs.delete(roomId);
        }
      };
    }

    const sub: RoomSub = { refCount: 1, cleanup: () => undefined };
    sub.cleanup = startSubscription(roomId);
    activeSubs.set(roomId, sub);

    return () => {
      sub.refCount -= 1;
      if (sub.refCount <= 0) {
        sub.cleanup();
        activeSubs.delete(roomId);
      }
    };
  }, [roomId]);
}
