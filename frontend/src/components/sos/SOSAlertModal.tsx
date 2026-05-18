import { useEffect, useRef, useCallback } from 'react';
import { useSOSStore, type SOSEvent } from '../../store/sos.store';
import { useAuthStore } from '../../store/auth.store';
import { vibrateSOS } from '../../lib/vibration';
import { useNavigate } from 'react-router-dom';

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
}

function synthesizeAlarm(ctx: AudioContext): void {
  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.2);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.4);
    oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.6);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);
  } catch {
    // Audio API not available
  }
}

interface SOSAlertCardProps {
  sos: SOSEvent;
  isOwnSOS: boolean;
  onResolve: (sosId: string) => void;
}

function SOSAlertCard({ sos, isOwnSOS, onResolve }: SOSAlertCardProps) {
  const navigate = useNavigate();

  const handleOpenMap = () => {
    navigate('/map');
  };

  const handleCall = () => {
    // tel: link as a best-effort fallback — works on mobile
    window.open(`tel:`, '_self');
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-red-700 p-5 shadow-2xl mx-auto w-full max-w-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-3xl">🚨</span>
        <h2 className="text-red-400 font-bold text-lg uppercase tracking-wide">Emergency Alert</h2>
      </div>

      <p className="text-white font-semibold text-base mb-1">
        {isOwnSOS ? 'You triggered an SOS' : `${sos.username} needs help!`}
      </p>

      <p className="text-slate-300 text-sm mb-3 italic">"{sos.message}"</p>

      <p className="text-slate-400 text-xs mb-4">{formatRelativeTime(sos.createdAt)}</p>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={handleOpenMap}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          📍 Open Map
        </button>
        {!isOwnSOS && (
          <button
            type="button"
            onClick={handleCall}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            📞 Call
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {!isOwnSOS && (
          <button
            type="button"
            onClick={() => onResolve(sos._id)}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            ✓ I'm going to help
          </button>
        )}
        {isOwnSOS && (
          <button
            type="button"
            onClick={() => onResolve(sos._id)}
            className="flex-1 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Cancel SOS
          </button>
        )}
      </div>
    </div>
  );
}

export default function SOSAlertModal() {
  const activeSOSEvents = useSOSStore((s) => s.activeSOSEvents);
  const resolveSOS = useSOSStore((s) => s.resolveSOS);
  const myActiveSOSId = useSOSStore((s) => s.myActiveSOSId);
  const currentUserId = useAuthStore((s) => s.user?._id ?? '');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmedIdsRef = useRef<Set<string>>(new Set());

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  // Play alarm + vibrate for newly arrived SOS events from OTHER users
  useEffect(() => {
    for (const sos of activeSOSEvents) {
      if (sos.userId === currentUserId) continue; // don't alarm yourself
      if (alarmedIdsRef.current.has(sos._id)) continue;
      alarmedIdsRef.current.add(sos._id);
      vibrateSOS();
      try {
        synthesizeAlarm(getAudioCtx());
      } catch {
        // Ignore autoplay restrictions
      }
    }
  }, [activeSOSEvents, currentUserId, getAudioCtx]);

  // Cleanup alarms for resolved events
  useEffect(() => {
    const activeIds = new Set(activeSOSEvents.map((e) => e._id));
    for (const id of [...alarmedIdsRef.current]) {
      if (!activeIds.has(id)) alarmedIdsRef.current.delete(id);
    }
  }, [activeSOSEvents]);

  // Only show modal for OTHER people's SOS (own SOS is shown via SOSButton state)
  const othersSOSEvents = activeSOSEvents.filter((e) => e.userId !== currentUserId);

  if (othersSOSEvents.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[1400] flex flex-col items-center justify-center bg-black bg-opacity-80 p-4 gap-4 overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col gap-4">
        {othersSOSEvents.map((sos) => (
          <SOSAlertCard
            key={sos._id}
            sos={sos}
            isOwnSOS={sos._id === myActiveSOSId}
            onResolve={(id) => void resolveSOS(id)}
          />
        ))}
      </div>
    </div>
  );
}
