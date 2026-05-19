import api from './axios';

/**
 * REST client for the Music Jukebox room widgets.
 *
 * Mirrors the backend in `backend/src/routes/jukebox.routes.ts`. Every call
 * targets `/rooms/:id/widgets/juke/...`.
 */

export type JukeboxPlayState = 'queued' | 'playing' | 'done' | 'skipped';

export interface JukeboxTrack {
  id: string;
  roomId: string;
  title: string;
  artist: string;
  durationSec: number | null;
  attachmentId: string | null;
  externalUrl: string | null;
  addedBy: string;
  position: number;
  playState: JukeboxPlayState;
  startedAt: string | null;
  skipVotes: string[];
  voteNextBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JukeboxQueueResponse {
  playing: JukeboxTrack | null;
  queue: JukeboxTrack[];
  memberCount?: number;
}

export interface JukeboxEnqueuePayload {
  title: string;
  artist?: string;
  durationSec?: number;
  attachmentId?: string;
  externalUrl?: string;
}

export interface JukeboxSkipResponse extends JukeboxQueueResponse {
  ratio: { votes: number; total: number };
  advanced: boolean;
  trackId: string | null;
}

export const getQueue = (roomId: string) =>
  api.get<JukeboxQueueResponse>(`/rooms/${roomId}/widgets/juke/queue`);

export const enqueueTrack = (roomId: string, payload: JukeboxEnqueuePayload) =>
  api.post<{ track: JukeboxTrack } & JukeboxQueueResponse>(
    `/rooms/${roomId}/widgets/juke/queue`,
    payload,
  );

export const removeTrack = (roomId: string, trackId: string) =>
  api.delete<JukeboxQueueResponse>(`/rooms/${roomId}/widgets/juke/queue/${trackId}`);

export const reorderTrack = (roomId: string, trackId: string, position: number) =>
  api.patch<JukeboxQueueResponse>(
    `/rooms/${roomId}/widgets/juke/queue/${trackId}`,
    { position },
  );

export const castSkipVote = (roomId: string) =>
  api.post<JukeboxSkipResponse>(`/rooms/${roomId}/widgets/juke/skip`);

export const castVoteNext = (roomId: string, trackId: string) =>
  api.post<JukeboxQueueResponse>(`/rooms/${roomId}/widgets/juke/vote-next`, {
    trackId,
  });

export const advanceTrack = (roomId: string, force = false) =>
  api.post<JukeboxQueueResponse>(`/rooms/${roomId}/widgets/juke/advance`, { force });

/** Resolve a track's playable audio URL (attachment or external). */
export function getTrackSrc(track: Pick<JukeboxTrack, 'attachmentId' | 'externalUrl'>): string | null {
  if (track.externalUrl) return track.externalUrl;
  if (track.attachmentId) return `/api/v1/attachments/${track.attachmentId}`;
  return null;
}
