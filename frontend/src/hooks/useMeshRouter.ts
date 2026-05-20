import { useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { MeshRouter, createWsTransport, decodeText, type RouterEvent } from '../lib/mesh';
import { createAudioTransport, type AudioMeshTransport, getMode } from '../lib/mesh/audio';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';

/**
 * Per-room mesh wiring hook. For the active room it:
 *
 *  - builds a fresh `MeshRouter`
 *  - registers the WS transport (so frames bridge to the rest of the room)
 *  - lazy-builds an `AudioMeshTransport` exposed through `audioTransport`
 *  - re-emits text frames into the chat store as a `[via Radio] <text>` message
 *  - tears everything down on unmount or roomId change
 *
 * The composer + side-panel both consume the same hook by calling it with the
 * current `roomId`; React's commit semantics ensure they each get a stable
 * reference to the underlying router/audio transport.
 *
 * Note: a single shared `AudioContext` lives on `window` so the transport can
 * be passed between renders without disposing the mic stream every time the
 * user picks a different room.
 */

let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioContext) return sharedAudioContext;
  type WithLegacyCtor = typeof window & { webkitAudioContext?: typeof AudioContext };
  const w = window as WithLegacyCtor;
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

export type AudioStateLabel = 'closed' | 'listening' | 'idle' | 'transmitting' | 'error';

export interface UseMeshRouterResult {
  router: MeshRouter | null;
  audioTransport: AudioMeshTransport | null;
  /** Combined audio state ("closed" → "listening" → "transmitting" → back). */
  audioState: AudioStateLabel;
  /** TX progress (0..1) while transmitting. */
  txProgress: number;
  /** Open the mic + start the decoder. */
  openAudio: () => Promise<void>;
  /** Close the mic + stop the decoder. */
  closeAudio: () => void;
}

export function useMeshRouter(roomId: string | null): UseMeshRouterResult {
  const { socket } = useSocket();
  const currentUserId = useAuthStore((s) => s.user?._id ?? null);
  const appendMessage = useChatStore((s) => s.appendMessage);

  const [audioState, setAudioState] = useState<AudioStateLabel>('closed');
  const [txProgress, setTxProgress] = useState(0);

  // Stable router instance per room — gives the composer + panel the same one.
  const router = useMemo(() => (roomId ? new MeshRouter() : null), [roomId]);
  const audioRef = useRef<AudioMeshTransport | null>(null);

  // Build the audio transport once per room. AudioContext stays shared so
  // navigating between radio rooms doesn't re-prompt for mic permission.
  if (roomId && router && !audioRef.current) {
    const ctx = getAudioContext();
    if (ctx) {
      audioRef.current = createAudioTransport({
        audioContext: ctx,
        mode: getMode('bfsk300'),
        onTxProgress: setTxProgress,
        onTxStateChange: (s) => {
          setAudioState((prev) =>
            s === 'transmitting'
              ? 'transmitting'
              : audioRef.current?.isOpen()
                ? 'listening'
                : prev === 'error'
                  ? 'error'
                  : 'closed',
          );
        },
        onRxStateChange: (s) => {
          setAudioState((prev) => {
            if (s === 'error') return 'error';
            if (s === 'closed') return 'closed';
            // Don't downgrade from 'transmitting' just because RX is listening.
            return prev === 'transmitting' ? prev : 'listening';
          });
        },
      });
      router.addTransport(audioRef.current);
    }
  }

  // Register / refresh the WS transport whenever the socket connects.
  useEffect(() => {
    if (!router || !roomId || !socket) return;
    const transport = createWsTransport({ socket, roomId });
    router.addTransport(transport);
    return () => {
      router.removeTransport('ws');
    };
  }, [router, roomId, socket]);

  // Listen for inbound text frames and surface them as chat messages.
  useEffect(() => {
    if (!router || !roomId) return;
    const unsub = router.onFrame((ev: RouterEvent) => {
      if (ev.frame.type !== 'text') return;
      let text = '';
      try {
        text = decodeText(ev.frame);
      } catch {
        return;
      }
      // Append a synthetic chat message. The id is derived from the frame mid
      // so the store's id-based dedup prevents repeats if the same frame
      // arrives over multiple transports (the router already dedups, but the
      // store guard is a cheap belt-and-braces).
      const synthId = `radio:${ev.frame.mid.toString(16)}`;
      appendMessage(roomId, {
        _id: synthId,
        content: `[via Radio] ${text}`,
        author: {
          _id: currentUserId ?? 'radio',
          username: ev.sourceTransport === 'audio' ? 'radio · air' : 'radio · ws',
        },
        roomId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    return unsub;
  }, [router, roomId, appendMessage, currentUserId]);

  // Tear down the router (and its audio transport) when the room changes or
  // the component unmounts.
  useEffect(() => {
    return () => {
      router?.dispose();
      audioRef.current = null;
    };
  }, [router]);

  const openAudio = async () => {
    if (!audioRef.current) throw new Error('Audio transport unavailable');
    await audioRef.current.open();
    setAudioState(audioRef.current.isTransmitting() ? 'transmitting' : 'listening');
  };

  const closeAudio = () => {
    audioRef.current?.close();
    setAudioState('closed');
    setTxProgress(0);
  };

  return {
    router,
    audioTransport: audioRef.current,
    audioState,
    txProgress,
    openAudio,
    closeAudio,
  };
}
