import { useRef, useCallback, useEffect } from 'react';
import type { UsePTTResult } from '../../hooks/usePTT';
import { useNetworkStore } from '../../store/network.store';

interface PTTButtonProps {
  roomId: string;
  ptt: UsePTTResult;
  /** Username of the active speaker (resolved by parent from user store). */
  activeSpeakerName?: string;
}

export function PTTButton({ roomId, ptt, activeSpeakerName }: PTTButtonProps) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { isTransmitting, isReceiving, isBusy, startTransmitting, stopTransmitting } = ptt;
  const holdRef = useRef(false);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (!isOnline) return;
      if (isBusy && !isTransmitting) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      if (holdRef.current) return;
      holdRef.current = true;
      await startTransmitting(roomId);
    },
    [isOnline, isBusy, isTransmitting, startTransmitting, roomId],
  );

  const handlePointerUp = useCallback(() => {
    if (!holdRef.current) return;
    holdRef.current = false;
    stopTransmitting();
  }, [stopTransmitting]);

  // Keyboard Space bar support
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      if (!isOnline || (isBusy && !isTransmitting)) return;
      if (holdRef.current) return;
      holdRef.current = true;
      await startTransmitting(roomId);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!holdRef.current) return;
      holdRef.current = false;
      stopTransmitting();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOnline, isBusy, isTransmitting, startTransmitting, stopTransmitting, roomId]);

  const isDisabled = !isOnline || (isBusy && !isTransmitting);

  const tooltip = !isOnline
    ? 'Offline — PTT unavailable'
    : isTransmitting
      ? 'Release to stop'
      : isBusy
        ? activeSpeakerName
          ? `${activeSpeakerName} is speaking…`
          : 'Someone is speaking…'
        : 'Hold to talk (Space)';

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      {/* Receiving indicator */}
      {isReceiving && !isTransmitting && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/60 border border-green-700/50 text-green-400 text-xs whitespace-nowrap">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {activeSpeakerName ? `${activeSpeakerName} speaking` : 'Incoming audio'}
        </div>
      )}

      {/* PTT button */}
      <button
        type="button"
        aria-label="Hold to talk"
        aria-pressed={isTransmitting}
        title={tooltip}
        disabled={isDisabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={[
          'relative flex items-center justify-center rounded-full transition-all duration-150 select-none touch-none',
          'w-10 h-10',
          isDisabled
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
            : isTransmitting
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/60'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white',
        ].join(' ')}
      >
        {/* Pulsing ring while transmitting */}
        {isTransmitting && (
          <span className="absolute inset-0 rounded-full animate-ping bg-red-500 opacity-40" />
        )}

        {/* Microphone icon */}
        <svg
          className="w-5 h-5 relative z-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
          />
        </svg>
      </button>
    </div>
  );
}
