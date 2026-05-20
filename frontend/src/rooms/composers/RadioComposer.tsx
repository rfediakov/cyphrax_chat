import { useCallback, useEffect, useRef, useState } from 'react';
import { useMeshRouter } from '../../hooks/useMeshRouter';
import { useChatStore } from '../../store/chat.store';
import { sendRoomMessage } from '../../api/messages.api';
import { useToast } from '../../components/ui/Toast';
import { encodeTextFrame, randomMid } from '../../lib/mesh';
import { estimateDurationMs } from '../../lib/mesh/audio';
import { RadioModemPanel } from '../widgets/RadioModemPanel';
import { RadioDisclaimerModal } from '../modals/RadioDisclaimerModal';
import type { RoomComponentProps } from '../RoomBlueprint';

/**
 * Radio composer — replaces `MessageInput` for `radio_mesh` rooms.
 *
 * UX flow per `docs/ROOMS_AND_MESH_PLAN.md` §5.1:
 *   ┌─ message text input ─┐ [Send chat]
 *   ┌────────────────────────────────────────────────┐
 *   │     ●   Key Radio (hold)    progress 32%       │
 *   └────────────────────────────────────────────────┘
 *
 * "Key Radio" encodes the text as a `text` mesh frame and ships it through
 * the mesh router (audio + WS together — the WS path is the demo bridge).
 * After a successful TX we also post a normal chat message via the existing
 * API so the room's persistent message history records the broadcast.
 */
export function RadioComposer({ roomId }: RoomComponentProps) {
  const { router, audioTransport, audioState, txProgress, openAudio } = useMeshRouter(roomId);
  const { showToast } = useToast();
  const appendMessage = useChatStore((s) => s.appendMessage);

  const [text, setText] = useState('');
  const [keying, setKeying] = useState(false);
  const inFlightRef = useRef(false);

  const isTransmitting = audioState === 'transmitting';

  const handleKeyRadio = useCallback(async () => {
    if (inFlightRef.current) return;
    const content = text.trim();
    if (!content) {
      showToast('Type a message first', 'info');
      return;
    }
    if (!router || !audioTransport) {
      showToast('Mesh transport not ready', 'error');
      return;
    }
    inFlightRef.current = true;
    setKeying(true);

    // Make sure the receiver pipeline is hot before we transmit, so the user
    // can do a loopback test (own speaker → own mic) and see their text come
    // back through the chat.
    try {
      if (!audioTransport.isOpen()) {
        await openAudio();
      }
    } catch (err) {
      console.warn('[RadioComposer] couldn\'t auto-open mic for self-RX:', err);
    }

    const mid = randomMid();
    try {
      await router.send({ type: 'text', payload: new TextEncoder().encode(content), mid });

      // Post a normal chat message so the room's persistent history records
      // the broadcast. We do this after the transmission completes so the
      // chat order matches the on-air order.
      try {
        const resp = await sendRoomMessage(roomId, { content: `[via Radio] ${content}` });
        appendMessage(roomId, resp.data.message);
      } catch (err) {
        console.error('[RadioComposer] follow-up chat post failed:', err);
      }
      setText('');
    } catch (err) {
      console.error('[RadioComposer] router.send failed:', err);
      showToast('Radio transmission failed', 'error');
    } finally {
      inFlightRef.current = false;
      setKeying(false);
    }
  }, [text, router, audioTransport, openAudio, roomId, appendMessage, showToast]);

  // Estimate transmission length for the "press and hold" pulse animation.
  const estDurationMs = (() => {
    if (!text.trim()) return 0;
    try {
      const frame = encodeTextFrame(text.trim());
      return estimateDurationMs(frame, audioTransport?.getMode() ?? { id: 'bfsk300', markHz: 1200, spaceHz: 2200, baud: 300, preambleMs: 250, tailMs: 250 });
    } catch {
      return 0;
    }
  })();

  // Hidden hot-key: Space to key the radio when the input isn't focused. We
  // gate this behind a ref to avoid double-fires on autorepeat.
  const holdingRef = useRef(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (holdingRef.current) return;
      holdingRef.current = true;
      void handleKeyRadio();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      holdingRef.current = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [handleKeyRadio]);

  return (
    <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      <RadioDisclaimerModal active={!!roomId} />

      {/* Compact modem panel inline for mobile (the same widget can also be
          rendered in the right sidebar via the blueprint's `widgets` array). */}
      <div className="mb-2 md:hidden">
        <RadioModemPanel roomId={roomId} />
      </div>

      {/* Pressable PTT row */}
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message to broadcast over the audio modem…"
          aria-label="Radio message"
          className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={isTransmitting}
        />

        <button
          type="button"
          onClick={handleKeyRadio}
          disabled={!text.trim() || isTransmitting || keying}
          aria-pressed={isTransmitting}
          aria-label="Key Radio — broadcast as audio modem frame"
          className={[
            'relative w-full overflow-hidden rounded-xl py-3 text-base font-semibold transition-colors touch-none select-none',
            'min-h-[56px] flex items-center justify-center gap-2',
            isTransmitting
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/60'
              : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-gray-900 disabled:bg-gray-700 disabled:text-gray-500',
          ].join(' ')}
        >
          {isTransmitting && (
            <span
              className="absolute inset-y-0 left-0 bg-red-500/40 transition-[width] duration-100"
              style={{ width: `${Math.round(txProgress * 100)}%` }}
              aria-hidden="true"
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 4.93a10 10 0 0 1 0 14.14M3.51 19.07a10 10 0 0 1 0-14.14" />
            </svg>
            {isTransmitting
              ? `Transmitting · ${Math.round(txProgress * 100)}%`
              : 'Key Radio (hold)'}
          </span>
        </button>

        {estDurationMs > 0 && !isTransmitting && (
          <p className="text-[11px] text-gray-500 text-center" aria-live="polite">
            Will take ~{(estDurationMs / 1000).toFixed(1)} s on air ·
            {' '}{audioTransport?.getMode()?.id ?? 'bfsk300'}
          </p>
        )}
      </div>
    </div>
  );
}
