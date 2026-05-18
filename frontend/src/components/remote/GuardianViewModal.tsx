import { useEffect, useRef } from 'react';
import { useRemoteStore } from '../../store/remote.store';

export default function GuardianViewModal() {
  const activeSession = useRemoteStore((s) => s.activeSession);
  const stopSession = useRemoteStore((s) => s.stopSession);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isGuardian = activeSession?.isGuardian;

  useEffect(() => {
    if (!isGuardian || !activeSession?.remoteStream) return;
    if (videoRef.current) {
      videoRef.current.srcObject = activeSession.remoteStream;
    }
  }, [isGuardian, activeSession?.remoteStream]);

  if (!isGuardian) return null;

  const remainingMs = activeSession.endsAt - Date.now();
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remote camera view"
      className="fixed inset-0 z-[9990] flex flex-col bg-black"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          <span className="text-white font-semibold text-sm">
            {activeSession.peerUsername}
          </span>
          <span className="text-gray-400 text-xs">· Live camera</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs">{remainingMin}min left</span>
          <button
            type="button"
            onClick={stopSession}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label="End remote view"
          >
            End view
          </button>
        </div>
      </div>

      {/* Video feed */}
      <div className="flex-1 flex items-center justify-center bg-black">
        {activeSession.remoteStream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="max-w-full max-h-full object-contain"
            aria-label="Live video feed from child's device"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <div className="w-10 h-10 border-2 border-gray-600 border-t-orange-500 rounded-full animate-spin" />
            <p className="text-sm">Connecting to camera…</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0">
        <p className="text-gray-500 text-xs text-center">
          One-way video only · Session logged for privacy
        </p>
      </div>
    </div>
  );
}
