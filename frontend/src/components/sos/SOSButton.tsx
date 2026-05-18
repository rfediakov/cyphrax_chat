import { useRef, useState, useCallback, useEffect } from 'react';
import { useSOSStore } from '../../store/sos.store';
import { useChatStore } from '../../store/chat.store';
import { vibrateSOS } from '../../lib/vibration';
import { useNetworkStore } from '../../store/network.store';

const HOLD_DURATION_MS = 2000;
const DISTRESS_MESSAGES = ["I'm in danger", 'Medical emergency', "I'm lost"];

type ButtonState = 'idle' | 'holding' | 'active';

export default function SOSButton() {
  const myActiveSOSId = useSOSStore((s) => s.myActiveSOSId);
  const triggerSOS = useSOSStore((s) => s.triggerSOS);
  const resolveSOS = useSOSStore((s) => s.resolveSOS);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const isOnline = useNetworkStore((s) => s.isOnline);

  const [buttonState, setButtonState] = useState<ButtonState>(myActiveSOSId ? 'active' : 'idle');
  const [progress, setProgress] = useState(0); // 0–100
  const [showMessagePicker, setShowMessagePicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(DISTRESS_MESSAGES[0]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelCountdown, setCancelCountdown] = useState(10);

  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Sync external state changes (e.g. resolved remotely)
  useEffect(() => {
    if (!myActiveSOSId && buttonState === 'active') {
      setButtonState('idle');
      setShowCancelConfirm(false);
    }
  }, [myActiveSOSId, buttonState]);

  const clearHoldTimers = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    holdTimerRef.current = null;
    progressIntervalRef.current = null;
  }, []);

  const fireSOS = useCallback(
    async (message: string) => {
      setShowMessagePicker(false);
      const roomId = activeRoomId ?? '';
      if (!roomId) return;

      vibrateSOS();
      setButtonState('active');
      await triggerSOS(roomId, message);
    },
    [activeRoomId, triggerSOS],
  );

  const handlePointerDown = useCallback(() => {
    if (buttonState === 'active') {
      // Second press: open cancel dialog
      setShowCancelConfirm(true);
      setCancelCountdown(10);
      if (cancelCountdownRef.current) clearInterval(cancelCountdownRef.current);
      cancelCountdownRef.current = setInterval(() => {
        setCancelCountdown((c) => {
          if (c <= 1) {
            clearInterval(cancelCountdownRef.current!);
            // Auto-confirm cancel
            if (myActiveSOSId) void resolveSOS(myActiveSOSId);
            setShowCancelConfirm(false);
            setButtonState('idle');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return;
    }

    if (buttonState !== 'idle') return;

    setButtonState('holding');
    setProgress(0);
    startTimeRef.current = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(Math.min((elapsed / HOLD_DURATION_MS) * 100, 100));
    }, 30);

    holdTimerRef.current = setTimeout(() => {
      clearHoldTimers();
      setProgress(100);
      setButtonState('idle'); // Temporarily idle while showing picker
      setShowMessagePicker(true);
    }, HOLD_DURATION_MS);
  }, [buttonState, clearHoldTimers, myActiveSOSId, resolveSOS]);

  const handlePointerUp = useCallback(() => {
    if (buttonState === 'holding') {
      clearHoldTimers();
      setButtonState('idle');
      setProgress(0);
    }
  }, [buttonState, clearHoldTimers]);

  const handleCancelSOS = useCallback(() => {
    if (cancelCountdownRef.current) clearInterval(cancelCountdownRef.current);
    if (myActiveSOSId) void resolveSOS(myActiveSOSId);
    setShowCancelConfirm(false);
    setButtonState('idle');
  }, [myActiveSOSId, resolveSOS]);

  const handleDismissCancel = useCallback(() => {
    if (cancelCountdownRef.current) clearInterval(cancelCountdownRef.current);
    setShowCancelConfirm(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearHoldTimers();
      if (cancelCountdownRef.current) clearInterval(cancelCountdownRef.current);
    };
  }, [clearHoldTimers]);

  const isActive = buttonState === 'active';
  const isHolding = buttonState === 'holding';
  const circumference = 2 * Math.PI * 24; // r=24
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <>
      {/* SOS Button */}
      <button
        type="button"
        aria-label="Emergency SOS alert"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '16px',
          zIndex: 1100,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        className={`flex items-center justify-center transition-all shadow-lg ${
          isActive
            ? 'bg-red-600 animate-pulse'
            : 'bg-red-500 hover:bg-red-600 active:scale-95'
        }`}
      >
        {/* Progress ring SVG */}
        {isHolding && (
          <svg
            className="absolute inset-0"
            width="56"
            height="56"
            viewBox="0 0 56 56"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="3"
            />
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 30ms linear' }}
            />
          </svg>
        )}

        <span className="relative text-white font-bold text-sm select-none">SOS</span>

        {!isOnline && (
          <span
            className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-white"
            title="Offline — SOS will be queued"
          />
        )}
      </button>

      {/* Distress message picker */}
      {showMessagePicker && (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black bg-opacity-60"
          onClick={() => {
            setShowMessagePicker(false);
          }}
        >
          <div
            className="bg-slate-900 rounded-t-2xl w-full max-w-md p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white text-center font-semibold mb-3 text-base">
              Select distress message
            </p>
            <p className="text-slate-400 text-center text-xs mb-4">
              Sending in 3 seconds — tap to choose
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {DISTRESS_MESSAGES.map((msg) => (
                <button
                  key={msg}
                  type="button"
                  onClick={() => {
                    setSelectedMessage(msg);
                    void fireSOS(msg);
                  }}
                  className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-colors ${
                    selectedMessage === msg
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {msg}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void fireSOS(selectedMessage)}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-base"
            >
              Send SOS Now
            </button>
          </div>
        </div>
      )}

      {/* Cancel SOS modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-slate-900 rounded-2xl p-6 mx-4 w-full max-w-sm text-center shadow-2xl border border-red-800">
            <div className="text-4xl mb-3">🚨</div>
            <h2 className="text-white font-bold text-xl mb-2">Cancel SOS?</h2>
            <p className="text-slate-400 text-sm mb-4">
              Auto-cancelling in <span className="text-red-400 font-bold">{cancelCountdown}s</span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDismissCancel}
                className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
              >
                Keep SOS
              </button>
              <button
                type="button"
                onClick={handleCancelSOS}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                Cancel SOS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
