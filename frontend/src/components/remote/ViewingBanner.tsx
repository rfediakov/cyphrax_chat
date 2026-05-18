import { useEffect, useRef } from 'react';
import { useRemoteStore } from '../../store/remote.store';

export default function ViewingBanner() {
  const activeSession = useRemoteStore((s) => s.activeSession);
  const stopSession = useRemoteStore((s) => s.stopSession);
  const vibrationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isChild = activeSession && !activeSession.isGuardian;

  useEffect(() => {
    if (!isChild) {
      if (vibrationRef.current) clearInterval(vibrationRef.current);
      return;
    }

    // Vibrate every 60 seconds as a reminder
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    vibrationRef.current = setInterval(() => {
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    }, 60_000);

    return () => {
      if (vibrationRef.current) clearInterval(vibrationRef.current);
    };
  }, [isChild]);

  if (!isChild) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-label={`${activeSession.peerUsername} is viewing your camera`}
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-between px-4 py-2.5 bg-orange-600 shadow-lg"
      style={{ minHeight: '48px' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0" aria-hidden="true">📹</span>
        <span className="text-white text-sm font-semibold truncate">
          {activeSession.peerUsername} is viewing your camera
        </span>
      </div>

      <button
        type="button"
        onClick={stopSession}
        className="shrink-0 ml-3 px-3 py-1.5 bg-white text-orange-700 font-bold text-xs rounded-lg hover:bg-orange-100 active:bg-orange-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
        aria-label="Stop remote view session"
      >
        Stop Now
      </button>
    </div>
  );
}
