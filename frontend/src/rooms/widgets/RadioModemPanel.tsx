import { useEffect, useMemo, useRef, useState } from 'react';
import { AVAILABLE_MODES, getMode, type ModeParams } from '../../lib/mesh/audio';
import { useMeshRouter, type AudioStateLabel } from '../../hooks/useMeshRouter';
import type { RoomComponentProps } from '../RoomBlueprint';
import { RadioDisclaimerModal } from '../modals/RadioDisclaimerModal';

/**
 * Right-side / now-strip panel for `radio_mesh` rooms.
 *
 * Surfaces:
 *  - mode picker (only BFSK 300 selectable in v1; AFSK 1200 reserved)
 *  - status pill (Idle / Listening / TX % / Decoding…) with `aria-live`
 *  - small canvas "waterfall" driven by an AnalyserNode (256-bin FFT)
 *  - "Open mic" toggle gated behind the first-run disclaimer
 *
 * The panel intentionally does *not* own the mesh router — it consumes the
 * shared `useMeshRouter(roomId)` so it shares state with the Radio composer.
 */
export function RadioModemPanel({ roomId }: RoomComponentProps) {
  const { audioTransport, audioState, txProgress, openAudio, closeAudio } = useMeshRouter(roomId);
  const [mode, setMode] = useState<ModeParams>(getMode('bfsk300'));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drive the mode on the underlying transport too.
  useEffect(() => {
    if (audioTransport) audioTransport.setMode(mode);
  }, [audioTransport, mode]);

  const isOpen = audioTransport?.isOpen() ?? false;

  const onToggle = async () => {
    if (!audioTransport) {
      setErrorMsg('Audio not available in this browser');
      return;
    }
    setErrorMsg(null);
    try {
      if (isOpen) {
        closeAudio();
      } else {
        await openAudio();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMsg('Microphone permission was denied');
      } else {
        setErrorMsg('Could not open the microphone — see browser settings');
        console.error('[RadioModemPanel] openAudio failed:', err);
      }
    }
  };

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 text-xs text-gray-200">
      <RadioDisclaimerModal active={!!roomId} />

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="font-semibold text-gray-100 text-sm flex items-center gap-1.5">
          <span aria-hidden="true" className="text-amber-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 4.93a10 10 0 0 1 0 14.14M3.51 19.07a10 10 0 0 1 0-14.14" />
            </svg>
          </span>
          Audio modem
        </div>
        <StatusPill state={audioState} txProgress={txProgress} />
      </div>

      <ModePicker value={mode.id} onChange={(id) => setMode(getMode(id))} />

      <Waterfall transport={audioTransport} isOpen={isOpen} />

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isOpen}
        className={[
          'mt-3 w-full rounded-lg py-2 text-sm font-medium transition-colors',
          isOpen
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-100',
        ].join(' ')}
      >
        {isOpen ? 'Stop listening' : 'Open mic'}
      </button>

      {errorMsg && (
        <p className="mt-2 text-[11px] text-red-400" role="alert">
          {errorMsg}
        </p>
      )}
      <p className="mt-2 text-[10px] text-gray-500 leading-snug">
        Decoder runs only while listening. Disable AGC / noise suppression on any
        external mic for best results.
      </p>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusPill({ state, txProgress }: { state: AudioStateLabel; txProgress: number }) {
  const label = (() => {
    switch (state) {
      case 'closed':
        return 'Idle';
      case 'listening':
        return 'Listening';
      case 'transmitting':
        return `TX ${Math.round(txProgress * 100)}%`;
      case 'error':
        return 'Error';
      default:
        return 'Idle';
    }
  })();
  const color = (() => {
    switch (state) {
      case 'listening':
        return 'bg-green-700/60 border-green-600 text-green-200';
      case 'transmitting':
        return 'bg-red-700/60 border-red-600 text-red-100';
      case 'error':
        return 'bg-red-900/70 border-red-700 text-red-200';
      default:
        return 'bg-gray-700/60 border-gray-600 text-gray-300';
    }
  })();
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide ${color}`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full ${state === 'listening' ? 'bg-green-400 animate-ping opacity-75' : 'opacity-0'}`} />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${state === 'transmitting' ? 'bg-red-400' : state === 'listening' ? 'bg-green-400' : state === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
      </span>
      {label}
    </span>
  );
}

function ModePicker({ value, onChange }: { value: ModeParams['id']; onChange: (id: ModeParams['id']) => void }) {
  return (
    <div className="flex items-center gap-1 mb-2">
      {Object.values(AVAILABLE_MODES).map((m) => {
        const isActive = m.id === value;
        const isReady = m.id === 'bfsk300';
        return (
          <button
            key={m.id}
            type="button"
            disabled={!isReady}
            onClick={() => onChange(m.id)}
            aria-pressed={isActive}
            title={isReady ? `${m.id} · ${m.baud} Bd` : `${m.id} — coming soon`}
            className={[
              'flex-1 rounded px-2 py-1 text-[11px] font-medium border transition-colors',
              isActive
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                : 'bg-gray-900/60 border-gray-700 text-gray-300 hover:border-gray-500',
              !isReady ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <span className="block uppercase tracking-wide">{m.id}</span>
            <span className="block text-[9px] text-gray-400 leading-tight">{m.baud} Bd</span>
          </button>
        );
      })}
    </div>
  );
}

interface WaterfallProps {
  transport: ReturnType<typeof useMeshRouter>['audioTransport'];
  isOpen: boolean;
}

function Waterfall({ transport, isOpen }: WaterfallProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fftBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Stable bin count for the waterfall image.
  const FFT_BINS = useMemo(() => 128, []);

  useEffect(() => {
    if (!isOpen || !transport) return;
    const analyser = transport.getRxAnalyser();
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Allocate over a concrete ArrayBuffer so the strict typed-array generic
    // resolves to `Uint8Array<ArrayBuffer>` (required by getByteFrequencyData).
    fftBufRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

    const draw = () => {
      const buf = fftBufRef.current;
      if (!buf || !ctx || !canvas) return;
      analyser.getByteFrequencyData(buf);

      const w = canvas.width;
      const h = canvas.height;

      // Scroll left by 1px so the right column shows the freshest spectrum.
      const img = ctx.getImageData(1, 0, w - 1, h);
      ctx.putImageData(img, 0, 0);

      // Paint the rightmost column. Downsample fbinCount to canvas height.
      const colX = w - 1;
      for (let y = 0; y < h; y++) {
        const binIdx = Math.floor(((h - 1 - y) / h) * Math.min(FFT_BINS, buf.length));
        const v = buf[binIdx] ?? 0;
        // Heatmap: low=dark blue, mid=amber, high=red-white.
        const r = v;
        const g = Math.max(0, v - 60);
        const b = Math.max(0, 200 - v);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(colX, y, 1, 1);
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [transport, isOpen, FFT_BINS]);

  return (
    <div className="relative w-full h-12 rounded bg-gray-900 border border-gray-700 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={256}
        height={48}
        className="w-full h-full"
        aria-label="Audio spectrum waterfall"
      />
      {!isOpen && (
        <span className="absolute inset-0 grid place-items-center text-[10px] text-gray-500 uppercase tracking-wider">
          Open mic to begin
        </span>
      )}
    </div>
  );
}
