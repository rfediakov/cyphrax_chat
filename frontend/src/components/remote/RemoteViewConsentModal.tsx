import { useEffect, useRef, useState } from 'react';
import { useRemoteStore, type ConsentDuration } from '../../store/remote.store';

const AUTO_DENY_SECONDS = 30;

export default function RemoteViewConsentModal() {
  const incomingRequest = useRemoteStore((s) => s.incomingRequest);
  const consentToView = useRemoteStore((s) => s.consentToView);

  const [countdown, setCountdown] = useState(AUTO_DENY_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!incomingRequest) {
      setCountdown(AUTO_DENY_SECONDS);
      return;
    }

    setCountdown(AUTO_DENY_SECONDS);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          consentToView(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [incomingRequest, consentToView]);

  if (!incomingRequest) return null;

  const handleDeny = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    consentToView(false);
  };

  const handleAllow = (duration: ConsentDuration) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    consentToView(true, duration);
  };

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = (countdown / AUTO_DENY_SECONDS) * circumference;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remote view consent request"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90 p-4"
    >
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-orange-600 px-6 py-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">📹</span>
          <div>
            <p className="text-white font-bold text-base">Camera access requested</p>
            <p className="text-orange-200 text-sm">Privacy-protected request</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 text-center">
          <div className="flex justify-center mb-4">
            <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r={radius} fill="none" stroke="#374151" strokeWidth="6" />
              <circle
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                stroke="#f97316"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
              <text
                x="36"
                y="41"
                textAnchor="middle"
                fill="white"
                fontSize="18"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {countdown}
              </text>
            </svg>
          </div>

          <p className="text-white text-lg font-semibold mb-1">
            {incomingRequest.guardianUsername}
          </p>
          <p className="text-gray-400 text-sm mb-2">is requesting to view your camera and mic</p>
          <p className="text-gray-500 text-xs mb-6">
            Auto-denied in {countdown}s if you don't respond
          </p>

          {/* Allow buttons */}
          <div className="flex gap-3 mb-3">
            <button
              type="button"
              onClick={() => handleAllow(1)}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              Allow 1 min
            </button>
            <button
              type="button"
              onClick={() => handleAllow(5)}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              Allow 5 min
            </button>
          </div>

          {/* Deny button — most prominent */}
          <button
            type="button"
            onClick={handleDeny}
            className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-xl text-base transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label="Deny camera access request"
          >
            DENY
          </button>

          <p className="text-gray-600 text-xs mt-4">
            Denying blocks new requests for 5 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
