import { useEffect, useRef, useState } from 'react';
import { useCallsStore } from '../../store/calls.store';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function VideoEl({ stream, muted = false, className = '' }: { stream: MediaStream | null; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
}

export default function ActiveCallOverlay() {
  const activeCall = useCallsStore((s) => s.activeCall);
  const endCall = useCallsStore((s) => s.endCall);
  const toggleMute = useCallsStore((s) => s.toggleMute);
  const toggleVideo = useCallsStore((s) => s.toggleVideo);

  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!activeCall) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeCall.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  if (!activeCall) return null;

  const isVideo = activeCall.type === 'video';

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        aria-label="Restore call"
        className="fixed bottom-24 right-4 z-50 w-16 h-16 rounded-full bg-green-600 text-white flex flex-col items-center justify-center shadow-xl text-xs font-medium"
      >
        <span>{isVideo ? '📹' : '📞'}</span>
        <span>{formatDuration(elapsed)}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gray-900/90">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          <span className="text-white font-mono text-sm">{formatDuration(elapsed)}</span>
        </div>
        <p className="text-white font-semibold truncate max-w-[140px]">{activeCall.peerUsername}</p>
        <button
          onClick={() => setMinimized(true)}
          aria-label="Minimize call"
          className="text-white/70 hover:text-white text-xl px-2"
        >
          ⌟
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {isVideo && activeCall.remoteStream ? (
          <VideoEl
            stream={activeCall.remoteStream}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-5xl">
              {isVideo ? '📹' : '📞'}
            </div>
            <p className="text-white text-lg font-medium">{activeCall.peerUsername}</p>
            <p className="text-gray-400 text-sm">
              {activeCall.remoteStream ? 'Connected' : 'Connecting…'}
            </p>
          </div>
        )}

        {/* Local video PiP */}
        {isVideo && activeCall.localStream && !activeCall.videoOff && (
          <div className="absolute bottom-4 right-4 w-28 h-20 rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
            <VideoEl
              stream={activeCall.localStream}
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 px-4 py-6 pb-safe bg-gray-900/90">
        {/* Mute */}
        <button
          onClick={toggleMute}
          aria-label={activeCall.muted ? 'Unmute' : 'Mute'}
          className={`flex flex-col items-center gap-1 group`}
        >
          <span className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow transition-colors ${activeCall.muted ? 'bg-white text-gray-900' : 'bg-gray-700 text-white group-hover:bg-gray-600'}`}>
            {activeCall.muted ? '🔇' : '🎙'}
          </span>
          <span className="text-xs text-gray-400">{activeCall.muted ? 'Unmute' : 'Mute'}</span>
        </button>

        {/* End call */}
        <button
          onClick={endCall}
          aria-label="End call"
          className="flex flex-col items-center gap-1"
        >
          <span className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center text-2xl shadow-lg hover:bg-red-600 transition-colors">
            📵
          </span>
          <span className="text-xs text-gray-400">End</span>
        </button>

        {/* Camera toggle (video calls only) */}
        {isVideo && (
          <button
            onClick={toggleVideo}
            aria-label={activeCall.videoOff ? 'Turn camera on' : 'Turn camera off'}
            className="flex flex-col items-center gap-1 group"
          >
            <span className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow transition-colors ${activeCall.videoOff ? 'bg-white text-gray-900' : 'bg-gray-700 text-white group-hover:bg-gray-600'}`}>
              {activeCall.videoOff ? '📷' : '📹'}
            </span>
            <span className="text-xs text-gray-400">{activeCall.videoOff ? 'Cam on' : 'Cam off'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
