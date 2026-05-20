import { useEffect, useRef, useState } from 'react';
import {
  MARKER_KIND_CONFIG,
  MARKER_KINDS,
  type MarkerKind,
} from '../../lib/markerKinds';

interface AddMarkerSheetProps {
  open: boolean;
  /** Coordinates the user tapped on the map. */
  position: { lat: number; lng: number } | null;
  /** Suggested initial category — defaults to "pin". */
  initialKind?: MarkerKind;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (data: {
    kind: MarkerKind;
    label: string;
    description: string;
  }) => Promise<void> | void;
}

/**
 * Mobile-first bottom-sheet used to capture a new marker's category, label
 * and optional description. Designed to slide up from the bottom on phones
 * and dock near the bottom on wider screens.
 */
export default function AddMarkerSheet({
  open,
  position,
  initialKind = 'pin',
  busy = false,
  onCancel,
  onSubmit,
}: AddMarkerSheetProps) {
  const [kind, setKind] = useState<MarkerKind>(initialKind);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setLabel('');
    setDescription('');
    const t = setTimeout(() => labelInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, initialKind]);

  if (!open || !position) return null;

  const config = MARKER_KIND_CONFIG[kind];
  const trimmedLabel = label.trim();
  const canSubmit = trimmedLabel.length > 0 && !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit({
      kind,
      label: trimmedLabel || config.label,
      description: description.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add marker"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close add marker"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-md bg-slate-900 text-slate-100 rounded-t-2xl sm:rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_180ms_ease-out]"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-lg shrink-0"
              style={{ background: `${config.color}26`, color: config.color }}
              aria-hidden="true"
            >
              {config.emoji}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">Add marker</h2>
              <p className="text-[11px] text-slate-400 truncate">
                {config.hint}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white text-xl leading-none px-1"
            aria-label="Cancel"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 pt-2 flex-1 space-y-4">
          {/* Category picker */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">
              Category
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MARKER_KINDS.map((k) => {
                const cfg = MARKER_KIND_CONFIG[k];
                const selected = k === kind;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs transition-colors
                      ${
                        selected
                          ? 'border-blue-400 bg-blue-500/15 text-white'
                          : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    style={
                      selected
                        ? { boxShadow: `inset 0 0 0 1px ${cfg.color}80` }
                        : undefined
                    }
                    aria-pressed={selected}
                  >
                    <span
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-base"
                      style={{ background: `${cfg.color}26`, color: cfg.color }}
                      aria-hidden="true"
                    >
                      {cfg.emoji}
                    </span>
                    <span className="leading-none">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <div>
            <label
              htmlFor="marker-label"
              className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1"
            >
              Title
            </label>
            <input
              id="marker-label"
              ref={labelInputRef}
              type="text"
              maxLength={80}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. "${config.label} for the group"`}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
            />
            <div className="text-right text-[10px] text-slate-500 mt-0.5">
              {label.length}/80
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="marker-desc"
              className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1"
            >
              Notes <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              id="marker-desc"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add details that will help your group find this spot…"
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500 resize-none"
            />
            <div className="text-right text-[10px] text-slate-500 mt-0.5">
              {description.length}/500
            </div>
          </div>

          <p className="text-[11px] text-slate-500 font-mono">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </p>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-slate-800 bg-slate-900 rounded-b-2xl">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2 rounded-md text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: config.color }}
          >
            {busy ? 'Saving…' : 'Save marker'}
          </button>
        </div>
      </form>
    </div>
  );
}
