import { useEffect, useRef, useState } from 'react';
import type { RoomComponentProps } from '../RoomBlueprint';
import { useFmRoomState, useFmRoomSubscription } from './fmRoom.store';

/**
 * Thin status bar mounted above the message list inside an FM Tuner room.
 *
 *  - Shows the room's current station + a "via Vote" / "via Deck" badge.
 *  - Holds a single hidden `<audio>` element pointed at the station's stream
 *    URL. Audio is **per-user**: the play/mute toggle only affects this
 *    browser, never the room.
 *  - When the room's now-playing changes via the `room_widget:fm:now_playing`
 *    socket event, we swap the audio `src` and resume playback if the user
 *    had previously hit Play (autoplay needs a real user gesture — we honour
 *    that and let the playback fail silently if the browser blocks it).
 */
export function FmNowStrip({ roomId }: RoomComponentProps) {
  useFmRoomSubscription(roomId);
  const { nowPlaying, nowPlayingTick } = useFmRoomState(roomId);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // User-controlled "did the user ever say play". We honour autoplay policy:
  // playback is only attempted after the first user gesture.
  const [wantsPlay, setWantsPlay] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const streamUrl = nowPlaying?.station.streamUrl ?? '';

  // Swap `src` when the station changes, then resume playback if the user
  // was already playing. We use the tick instead of streamUrl alone so a
  // deck->vote->deck flip back to the same station still re-applies.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!streamUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (audio.src !== streamUrl) {
      audio.src = streamUrl;
      audio.load();
    }

    if (wantsPlay) {
      audio.play().catch((err: unknown) => {
        setPlaybackError(err instanceof Error ? err.message : 'Playback blocked');
      });
    }
  }, [streamUrl, nowPlayingTick, wantsPlay]);

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

  if (!nowPlaying) {
    return (
      <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-900/70 text-xs text-gray-400 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-600" aria-hidden="true" />
        <span className="truncate">No station selected — vote for one in the sidebar.</span>
      </div>
    );
  }

  const sourceLabel = nowPlaying.source === 'deck' ? 'via Deck' : 'via Vote';

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
        aria-label={wantsPlay ? 'Pause station' : 'Play station'}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors border ${
          wantsPlay
            ? 'bg-purple-500/20 border-purple-400 text-purple-200'
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
          className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 animate-pulse"
          aria-hidden="true"
        />
        <span className="text-gray-100 font-medium truncate">{nowPlaying.station.name}</span>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
            nowPlaying.source === 'deck'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'bg-purple-500/15 text-purple-300 border border-purple-500/40'
          }`}
        >
          {sourceLabel}
        </span>
      </div>

      {playbackError && (
        <span className="text-[10px] text-amber-300 hidden sm:inline truncate" title={playbackError}>
          {playbackError}
        </span>
      )}

      {/* Hidden audio element — playback is local to this user. */}
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />
    </div>
  );
}
