import { useRef, useState, useEffect } from 'react';
import { formatDuration } from '../../lib/mediaRecorder';

interface VideoMessageProps {
  src: string;
  thumbnailSrc?: string;
  duration: number | null;
}

export function VideoMessage({ src, thumbnailSrc, duration }: VideoMessageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  // Lazy load via IntersectionObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onError = () => setError(true);
    const onCanPlay = () => setLoaded(true);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    video.addEventListener('canplay', onCanPlay);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [expanded]);

  const handleExpand = () => {
    setExpanded(true);
    // Start playing after expanding
    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => undefined);
    });
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
    } else {
      video.play().catch(() => setError(true));
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 mt-1 p-2 bg-gray-700 rounded-lg border border-gray-600 max-w-xs">
        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="text-xs text-red-300">Video unavailable</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mt-1 max-w-xs rounded-xl overflow-hidden border border-gray-600">
      {!expanded ? (
        // Thumbnail with play overlay
        <button
          onClick={handleExpand}
          className="relative w-full aspect-video bg-gray-800 flex items-center justify-center group"
          aria-label="Play video"
        >
          {visible && thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
          )}
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/75 transition-colors">
              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* Duration badge */}
          {duration != null && (
            <span className="absolute bottom-1.5 right-1.5 text-xs text-white bg-black/60 px-1.5 py-0.5 rounded tabular-nums">
              {formatDuration(duration)}
            </span>
          )}
        </button>
      ) : (
        // Expanded inline video player
        <div className="relative bg-black">
          <video
            ref={videoRef}
            src={visible ? src : undefined}
            className="w-full max-h-64 object-contain"
            playsInline
            controls={loaded}
            onClick={togglePlay}
          />
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
