import { useEffect } from 'react';
import { create } from 'zustand';
import { socketSingleton } from '../../hooks/useSocket';
import {
  getNowPlaying,
  type FmNowPlaying,
  type FmTallyEntry,
  type FmStation,
} from '../../api/fmTuner.api';

/**
 * Per-room slice of FM Tuner state shared between `FmNowStrip` (always
 * mounted while the room is open) and `FmTunerPanel` (mounted only when the
 * widgets sidebar is open). One store keyed by roomId so both components
 * observe the same truth and we only run one socket subscription per room.
 */

export interface FmRoomState {
  nowPlaying: FmNowPlaying | null;
  totals: FmTallyEntry[];
  myStationId: string | null;
  loaded: boolean;
  /** Increments whenever a `now_playing` event arrives. The NowStrip uses
   *  this as a trigger to re-attempt playback if the user had it on. */
  nowPlayingTick: number;
}

interface FmStoreState {
  rooms: Record<string, FmRoomState>;
  setRoomState: (roomId: string, patch: Partial<FmRoomState>) => void;
  setMyStation: (roomId: string, stationId: string | null) => void;
  applyNowPlaying: (
    roomId: string,
    nowPlaying: FmNowPlaying | null,
  ) => void;
  applyTally: (roomId: string, totals: FmTallyEntry[]) => void;
}

const emptyRoom: FmRoomState = {
  nowPlaying: null,
  totals: [],
  myStationId: null,
  loaded: false,
  nowPlayingTick: 0,
};

export const useFmStore = create<FmStoreState>((set) => ({
  rooms: {},
  setRoomState: (roomId, patch) =>
    set((state) => ({
      rooms: {
        ...state.rooms,
        [roomId]: { ...(state.rooms[roomId] ?? emptyRoom), ...patch },
      },
    })),
  setMyStation: (roomId, stationId) =>
    set((state) => ({
      rooms: {
        ...state.rooms,
        [roomId]: {
          ...(state.rooms[roomId] ?? emptyRoom),
          myStationId: stationId,
        },
      },
    })),
  applyNowPlaying: (roomId, nowPlaying) =>
    set((state) => {
      const prev = state.rooms[roomId] ?? emptyRoom;
      return {
        rooms: {
          ...state.rooms,
          [roomId]: {
            ...prev,
            nowPlaying,
            nowPlayingTick: prev.nowPlayingTick + 1,
          },
        },
      };
    }),
  applyTally: (roomId, totals) =>
    set((state) => ({
      rooms: {
        ...state.rooms,
        [roomId]: { ...(state.rooms[roomId] ?? emptyRoom), totals },
      },
    })),
}));

/** Hook returning a read-only view of the cached state for `roomId`. */
export function useFmRoomState(roomId: string): FmRoomState {
  return useFmStore((s) => s.rooms[roomId] ?? emptyRoom);
}

// ── Per-room subscription manager ──────────────────────────────────────────
// Both NowStrip and Panel call `useFmRoomSubscription(roomId)`. The first
// caller (per roomId) fetches the initial state and wires up the socket
// listeners; subsequent callers piggy-back via a ref-count. When the last
// subscriber unmounts we tear everything down.

interface RoomSub {
  refCount: number;
  cleanup: () => void;
}

const activeSubs = new Map<string, RoomSub>();

interface SocketVotedPayload {
  roomId: string;
  stationId: string | null;
  totals: FmTallyEntry[];
}

interface SocketNowPlayingPayload {
  roomId: string;
  stationId: string | null;
  station: FmStation | null;
  source: 'vote' | 'deck' | null;
}

function startSubscription(roomId: string): () => void {
  const store = useFmStore.getState();

  // Initial hydration — non-blocking, errors are silent (the user can still
  // interact and the next socket event will fill state in).
  void getNowPlaying(roomId)
    .then((res) => {
      store.setRoomState(roomId, {
        nowPlaying: res.data.nowPlaying,
        totals: res.data.tally.totals,
        myStationId: res.data.myStationId,
        loaded: true,
      });
    })
    .catch(() => {
      store.setRoomState(roomId, { loaded: true });
    });

  const socket = socketSingleton;
  if (!socket) {
    // No socket yet — return a no-op cleanup so the ref-count still balances.
    return () => undefined;
  }

  const onVoted = (payload: SocketVotedPayload) => {
    if (payload.roomId !== roomId) return;
    store.applyTally(roomId, payload.totals);
  };

  const onNowPlaying = (payload: SocketNowPlayingPayload) => {
    if (payload.roomId !== roomId) return;
    if (!payload.stationId || !payload.station) {
      store.applyNowPlaying(roomId, null);
      return;
    }
    const source = payload.source === 'deck' ? 'deck' : 'vote';
    store.applyNowPlaying(roomId, {
      stationId: payload.stationId,
      station: payload.station,
      source,
    });
  };

  const onDeckChanged = (_payload: { roomId: string }) => {
    // The server always emits `room_widget:fm:now_playing` right after a
    // deck change, so no extra work is required here. The handler exists so
    // we can extend later if we want to track deck-only metadata.
  };

  socket.on('room_widget:fm:station_voted', onVoted);
  socket.on('room_widget:fm:now_playing', onNowPlaying);
  socket.on('room_widget:fm:deck_changed', onDeckChanged);

  return () => {
    socket.off('room_widget:fm:station_voted', onVoted);
    socket.off('room_widget:fm:now_playing', onNowPlaying);
    socket.off('room_widget:fm:deck_changed', onDeckChanged);
  };
}

/** Mount-time hook that wires up socket listeners + initial fetch for `roomId`. */
export function useFmRoomSubscription(roomId: string | null | undefined): void {
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
