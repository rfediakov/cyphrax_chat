import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useChatStore } from '../store/chat.store';
import {
  MeshRouter,
  createWsTransport,
  decodeText,
  encodeTextFrame,
  type RouterEvent,
} from '../lib/mesh';

/**
 * Dev-only mesh frame inspector — route `/dev/mesh`.
 *
 * Lets you pick one of your rooms, see live frames, and synthesise text
 * frames into the mesh router. Useful for R-2 / R-4 work before the audio
 * modem agent ships.
 */
export default function MeshInspector() {
  const { socket } = useSocket();
  const rooms = useChatStore((s) => s.rooms);

  const [roomId, setRoomId] = useState<string>('');
  const [draft, setDraft] = useState('Hello mesh!');
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [sending, setSending] = useState(false);
  const routerRef = useRef<MeshRouter | null>(null);

  useEffect(() => {
    if (!socket || !roomId) return;

    const router = new MeshRouter({
      onDecodeError: (err, raw) => {
        // eslint-disable-next-line no-console
        console.warn('[MeshInspector] decode error:', err, raw);
      },
    });
    router.addTransport(createWsTransport({ socket, roomId }));

    const unsub = router.onFrame((ev) => {
      setEvents((prev) => [toDisplay(ev, 'rx'), ...prev].slice(0, 200));
    });

    routerRef.current = router;
    return () => {
      unsub();
      router.dispose();
      routerRef.current = null;
    };
  }, [socket, roomId]);

  const handleSend = async () => {
    if (!routerRef.current || !draft.trim()) return;
    setSending(true);
    try {
      const bytes = encodeTextFrame(draft, { ttl: 4 });
      await routerRef.current.sendRaw(bytes);
      const txEvent: DisplayEvent = {
        id: cryptoRandomId(),
        direction: 'tx',
        mid: '—',
        ttl: 4,
        type: 'text',
        payloadLen: new TextEncoder().encode(draft).length,
        text: draft,
        transport: 'ws',
        relayed: false,
        createdAt: Date.now(),
      };
      setEvents((prev) => [txEvent, ...prev].slice(0, 200));
    } finally {
      setSending(false);
    }
  };

  const memberRooms = useMemo(() => rooms ?? [], [rooms]);

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">← Back</Link>
        <span className="text-gray-500 text-sm">/</span>
        <span className="text-sm text-gray-300">Mesh Inspector</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
          DEV
        </span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Room</label>
          <select
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setEvents([]);
            }}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Select a room you're a member of —</option>
            {memberRooms.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name} ({r.type ?? 'chat'})
              </option>
            ))}
          </select>
        </div>

        {roomId && (
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">Send a text frame</label>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="payload (UTF-8)…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg"
              >
                {sending ? '…' : 'TX'}
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 pt-4">
          <h2 className="text-sm font-semibold text-white mb-2">Frames ({events.length})</h2>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No frames yet. Pick a room and send one.</p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className={`px-3 py-2 rounded border ${
                    ev.direction === 'tx'
                      ? 'bg-blue-900/20 border-blue-800/50 text-blue-200'
                      : 'bg-gray-900 border-gray-800 text-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="uppercase text-[10px] tracking-wider opacity-70">
                      {ev.direction === 'tx' ? 'TX' : 'RX'}
                    </span>
                    <span>type={ev.type}</span>
                    <span>len={ev.payloadLen}</span>
                    <span>mid={typeof ev.mid === 'number' ? ev.mid.toString(16) : ev.mid}</span>
                    <span>ttl={ev.ttl}</span>
                    <span>via={ev.transport}</span>
                    {ev.relayed && <span className="text-amber-400">relayed</span>}
                  </div>
                  {ev.text !== null && (
                    <div className="mt-1 text-gray-300">"{ev.text}"</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

interface DisplayEvent {
  id: string;
  direction: 'tx' | 'rx';
  mid: number | string;
  ttl: number;
  type: string;
  payloadLen: number;
  text: string | null;
  transport: string;
  relayed: boolean;
  createdAt: number;
}

function toDisplay(ev: RouterEvent, dir: 'tx' | 'rx'): DisplayEvent {
  const text = ev.frame.type === 'text' ? safeDecodeText(ev.frame) : null;
  return {
    id: cryptoRandomId(),
    direction: dir,
    mid: ev.frame.mid,
    ttl: ev.frame.ttl,
    type: ev.frame.type,
    payloadLen: ev.frame.payload.length,
    text,
    transport: ev.sourceTransport,
    relayed: ev.relayed,
    createdAt: Date.now(),
  };
}

function safeDecodeText(frame: { payload: Uint8Array; type: string }): string | null {
  try {
    return decodeText(frame as never);
  } catch {
    return null;
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
