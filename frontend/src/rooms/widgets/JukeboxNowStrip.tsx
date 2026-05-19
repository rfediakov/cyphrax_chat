import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomComponentProps } from '../RoomBlueprint';
import { advanceTrack, castSkipVote, getTrackSrc } from '../../api/jukebox.api';
import {
  useJukeboxRoomState,
  useJukeboxRoomSubscription,
  useJukeboxStore,
} from './jukeboxRoom.store';

/**
 * Thin status bar mounted above the message list inside a Music Jukebox room.
 *
 *  - Title + artist + elapsed/duration of the playing track.
 *  - Skip-vote pill (count out of room member quorum).
 *  - Hidden `<audio>` element that streams the playing track. When the audio
 *    `ended` event fires we POST to `/widgets/juke/advance` so the server
 *    promotes the next queued track.
 *
 * Audio is **per-user**: the play/pause button only affects this browser.
 * That means listeners can stay in sync via `startedAt`, but each user has
 * to tap Play once (browser autoplay policies); we honour that strictly.
 */
export function JukeboxNowStrip({ roomId }: RoomComponentProps) {
  useJukeboxRoomSubscription(roomId);
  const { playing, trackTick, skipRatio, memberCount } = useJukeboxRoomState(roomId);
  const applySkipRatio = useJukeboxStore((s) => s.applySkipRatio);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [wantsPlay, setWantsPlay] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const trackSrc = playing ? getTrackSrc(playing) : null;
  const startedAtMs = playing?.startedAt ? new Date(playing.startedAt).getTime() : null;

  // Tick a 1s elapsed timer based on `startedAt`. Using the server-provided
  // timestamp keeps every viewer roughly in sync (within network skew),
  // independent of per-user play/pause state.
  useEffect(() => {
    if (!startedAtMs) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      const sec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      setElapsedSec(sec);
    };
    update();
    const handle = setInterval(update, 1000);
    return () => clearInterval(handle);
  }, [startedAtMs]);

  // Swap audio src whenever the playing track changes. Also tries to resume
  // playback when the user had tapped Play earlier — autoplay may still be
  // blocked, in which case we surface a polite error.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!trackSrc) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (audio.src !== trackSrc) {
      audio.src = trackSrc;
      audio.load();
    }

    if (wantsPlay) {
      audio.play().catch((err: unknown) => {
        setPlaybackError(err instanceof Error ? err.message : 'Playback blocked');
      });
    }
  }, [trackSrc, trackTick, wantsPlay]);

  // When the audio finishes naturally, tell the server to advance. The server
  // emits `track_changed` and `queue_updated` to everyone in the room.
  const handleEnded = useCallback(async () => {
    try {
      await advanceTrack(roomId, false);
    } catch {
      // Silent — the next listener (or refresh) will reconcile.
    }
  }, [roomId]);

  const handleTogglePlay = () => {
    setPlaybackError(null);
    const audio = audioRef.current;
    if (!audio) return;
    if (wantsPlay) {
      audio.pause();
      setWantsPlay(false);
      return;
    }
    setWantsPlay(true);
    audio.play().catch((err: unknown) => {
      setPlaybackError(err instanceof Error ? err.message : 'Playback blocked');
    });
  };

  const handleSkip = async () => {
    try {
      const res = await castSkipVote(roomId);
      // Reflect the new ratio immediately even though the socket event will
      // overwrite us a moment later. Avoids a UI flicker.
      applySkipRatio(roomId, res.data.ratio);
    } catch {
      // swallow — UI reconciles on next event
    }
  };

  if (!playing) {
    return (
      <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/70 text-xs text-gray-400 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-600" aria-hidden="true" />
        <span className="truncate">Queue is empty — add a track from the sidebar.</span>
      </div>
    );
  }

  const ratio = skipRatio ?? { votes: playing.skipVotes.length, total: memberCount };

  return (
    <div
      className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/70 flex items-center gap-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={handleTogglePlay}
        aria-pressed={wantsPlay}
        aria-label={wantsPlay ? 'Pause my playback' : 'Play this track'}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors border ${
          wantsPlay
            ? 'bg-pink-500/20 border-pink-400 text-pink-200'
            : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
        }`}
      >
        {wantsPlay ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-pink-400 shrink-0 animate-pulse"
          aria-hidden="true"
        />
        <span className="text-gray-100 font-medium truncate" title={playing.title}>
          {playing.title}
        </span>
        {playing.artist && (
          <span className="text-gray-400 truncate hidden sm:inline" title={playing.artist}>
            · {playing.artist}
          </span>
        )}
        <span className="ml-auto text-[10px] tabular-nums text-gray-400 shrink-0 hidden xs:inline">
          {formatTime(elapsedSec)}
          {playing.durationSec ? ` / ${formatTime(playing.durationSec)}` : ''}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSkip}
        aria-label="Vote to skip this track"
        className="shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
        title={`Skip vote · ${ratio.votes}/${ratio.total || '?'}`}
      >
        Skip {ratio.votes}
        {ratio.total > 0 ? `/${ratio.total}` : ''}
      </button>

      {playbackError && (
        <span className="text-[10px] text-amber-300 hidden sm:inline truncate" title={playbackError}>
          {playbackError}
        </span>
      )}

      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        onEnded={() => void handleEnded()}
      />
    </div>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
