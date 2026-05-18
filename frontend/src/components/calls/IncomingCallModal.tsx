import { useEffect, useRef } from 'react';
import { useCallsStore } from '../../store/calls.store';
import { vibratePattern, stopVibration } from '../../lib/vibration';

const RING_TIMEOUT_MS = 30_000;

function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      ctxRef.current?.close();
      ctxRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    function playBeep() {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = () => ctx.close();
    }

    playBeep();
    intervalRef.current = setInterval(playBeep, 1500);

    return () => {
      ctxRef.current?.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);
}

export default function IncomingCallModal() {
  const incomingCall = useCallsStore((s) => s.incomingCall);
  const answerCall = useCallsStore((s) => s.answerCall);
  const declineCall = useCallsStore((s) => s.declineCall);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRingtone(!!incomingCall);

  useEffect(() => {
    if (!incomingCall) {
      stopVibration();
      return;
    }

    vibratePattern([500, 300, 500, 300, 500, 300, 500]);

    // Auto-decline after 30 s
    timeoutRef.current = setTimeout(() => {
      declineCall(incomingCall.callId);
    }, RING_TIMEOUT_MS);

    return () => {
      stopVibration();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [incomingCall, declineCall]);

  if (!incomingCall) return null;

  const icon = incomingCall.type === 'video' ? '📹' : '📞';
  const label = incomingCall.type === 'video' ? 'video' : 'audio';

  function handleAnswer() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    void answerCall(incomingCall!.callId);
  }

  function handleDecline() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    declineCall(incomingCall!.callId);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="w-80 rounded-2xl bg-white p-8 shadow-2xl flex flex-col items-center gap-6">
        <div className="text-5xl">{icon}</div>

        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Incoming {label} call</p>
          <p className="text-xl font-semibold text-gray-900">{incomingCall.callerUsername}</p>
        </div>

        <div className="flex gap-8">
          <button
            onClick={handleDecline}
            aria-label="Decline call"
            className="flex flex-col items-center gap-1 group"
          >
            <span className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center text-2xl shadow-lg group-hover:bg-red-600 transition-colors">
              ✕
            </span>
            <span className="text-xs text-gray-500">Decline</span>
          </button>

          <button
            onClick={handleAnswer}
            aria-label="Answer call"
            className="flex flex-col items-center gap-1 group"
          >
            <span className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center text-2xl shadow-lg group-hover:bg-green-600 transition-colors">
              ✓
            </span>
            <span className="text-xs text-gray-500">Answer</span>
          </button>
        </div>
      </div>
    </div>
  );
}
