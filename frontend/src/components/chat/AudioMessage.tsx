import { useRef, useState, useEffect } from 'react';
import { formatDuration } from '../../lib/mediaRecorder';
import { useAuthorizedAttachmentBlobUrl } from '../../hooks/useAuthorizedAttachmentBlobUrl';

interface AudioMessageProps {
  src: string;
  duration: number | null;
}

export function AudioMessage({ src, duration }: AudioMessageProps) {
  const { blobUrl, loading: authLoading, error: authError } = useAuthorizedAttachmentBlobUrl(src);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState<number>(duration ?? 0);
  const [buffering, setBuffering] = useState(false);
  const [decodeError, setDecodeError] = useState(false);

  useEffect(() => {
    setDecodeError(false);
  }, [blobUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setTotalDuration(audio.duration);
    };
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onError = () => { setBuffering(false); setDecodeError(true); };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onError);
    };
  }, [blobUrl]);

  const error = authError || decodeError;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setDecodeError(true));
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;
  const displayTime = playing || currentTime > 0 ? currentTime : totalDuration;

  if (error) {
    return (
      <div className="flex items-center gap-2 mt-1 p-2 bg-gray-700 rounded-lg border border-gray-600 max-w-xs">
        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="text-xs text-red-300">Audio unavailable</span>
      </div>
    );
  }

  const busy = authLoading || buffering;

  return (
    <div className="flex items-center gap-2 mt-1 p-2 bg-gray-700 rounded-xl border border-gray-600 max-w-[260px]">
      {blobUrl ? <audio ref={audioRef} src={blobUrl} preload="metadata" /> : null}

      {/* Play/pause button */}
      <button
        onClick={togglePlay}
        disabled={busy || !blobUrl}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 transition-colors"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {busy ? (
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : playing ? (
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform bars + scrubber */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Decorative waveform bars */}
        <div className="flex items-center gap-px h-5">
          {Array.from({ length: 20 }).map((_, i) => {
            const barHeight = [30, 60, 80, 50, 90, 40, 70, 55, 85, 45, 75, 35, 65, 80, 50, 70, 40, 60, 85, 55][i];
            const filled = i / 20 <= progress;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-colors ${filled ? 'bg-blue-400' : 'bg-gray-500'}`}
                style={{ height: `${(barHeight / 100) * 20}px` }}
              />
            );
          })}
        </div>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={totalDuration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleScrub}
          className="w-full h-1 accent-blue-400 cursor-pointer"
          aria-label="Seek audio"
        />
      </div>

      {/* Duration */}
      <span className="text-xs text-gray-400 shrink-0 tabular-nums">
        {formatDuration(displayTime)}
      </span>
    </div>
  );
}
