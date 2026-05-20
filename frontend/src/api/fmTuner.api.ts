import api from './axios';

/**
 * FM Tuner widget API. Mirrors `backend/src/routes/fmTuner.routes.ts` and
 * `backend/src/services/roomTypes/fmTuner.service.ts` 1:1 so callers can
 * treat this module as the single source of truth for the wire shape.
 */

export interface FmStation {
  id: string;
  name: string;
  streamUrl: string;
  tags: string[];
  addedBy: string | null;
  isCurated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FmTallyEntry {
  stationId: string;
  votes: number;
}

export interface FmTally {
  winnerStationId: string | null;
  totals: FmTallyEntry[];
}

export type FmNowPlayingSource = 'vote' | 'deck';

export interface FmNowPlaying {
  stationId: string;
  station: FmStation;
  source: FmNowPlayingSource;
  voteCount?: number;
  totalMembers?: number;
}

export interface ListStationsResponse {
  stations: FmStation[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NowPlayingResponse {
  nowPlaying: FmNowPlaying | null;
  tally: FmTally;
  /** The caller's current vote, if any. */
  myStationId: string | null;
}

export interface VoteResponse {
  totals: FmTallyEntry[];
  nowPlaying: FmNowPlaying | null;
}

export interface DeckResponse {
  deckStationId: string | null;
  deckUntil: string | null;
  nowPlaying: FmNowPlaying | null;
}

export interface ProposeStationPayload {
  name: string;
  streamUrl: string;
  tags?: string[];
}

const base = (roomId: string) => `/rooms/${roomId}/widgets/fm`;

export const listStations = (roomId: string, params?: { q?: string; page?: number }) =>
  api.get<ListStationsResponse>(`${base(roomId)}/stations`, { params });

export const proposeStation = (roomId: string, payload: ProposeStationPayload) =>
  api.post<{ station: FmStation }>(`${base(roomId)}/stations`, payload);

export const getNowPlaying = (roomId: string) =>
  api.get<NowPlayingResponse>(`${base(roomId)}/now-playing`);

export const castVote = (roomId: string, stationId: string) =>
  api.post<VoteResponse>(`${base(roomId)}/vote`, { stationId });

export const clearVote = (roomId: string) =>
  api.delete<VoteResponse>(`${base(roomId)}/vote`);

export const takeDeck = (roomId: string, stationId: string, durationSec?: number) =>
  api.post<DeckResponse>(`${base(roomId)}/deck`, { stationId, durationSec });

export const releaseDeck = (roomId: string) =>
  api.delete<DeckResponse>(`${base(roomId)}/deck`);
