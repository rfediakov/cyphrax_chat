import { useMemo, useState } from 'react';
import { MARKER_KINDS, MARKER_KIND_CONFIG } from '../../lib/markerKinds';
import { useMapLayersStore, type MapLayerId } from '../../store/mapLayers.store';
import type { MapMarker } from '../../store/marker.store';

interface MapLegendProps {
  /** Whether the caller has their own position pinned on the map. */
  hasSelf: boolean;
  peerCount: number;
  sosCount: number;
  markers: MapMarker[];
  className?: string;
  /** Compact mode: smaller paddings, suited for the embedded mini-map. */
  compact?: boolean;
}

interface LegendRow {
  id: MapLayerId;
  label: string;
  count: number | null;
  /** Visual swatch — emoji over a tinted circle. */
  swatch: {
    color: string;
    emoji?: string;
    /** When true, draws a pulsing ring (SOS). */
    pulsing?: boolean;
    /** When true, draws a self-style ring. */
    ring?: boolean;
  };
  /** When false, the row is greyed out (no items to show on the map). */
  available: boolean;
}

/**
 * Interactive legend overlaid on the map. Lists every active layer with a
 * live count and a toggle. Mobile-first: starts collapsed as a pill, expands
 * into a vertical list that fits inside the map viewport.
 */
export default function MapLegend({
  hasSelf,
  peerCount,
  sosCount,
  markers,
  className = '',
  compact = false,
}: MapLegendProps) {
  const [expanded, setExpanded] = useState(false);
  const hidden = useMapLayersStore((s) => s.hidden);
  const toggle = useMapLayersStore((s) => s.toggle);
  const showAll = useMapLayersStore((s) => s.showAll);
  const hideAll = useMapLayersStore((s) => s.hideAll);

  const markerCountsByKind = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of MARKER_KINDS) counts[k] = 0;
    for (const m of markers) {
      counts[m.kind] = (counts[m.kind] ?? 0) + 1;
    }
    return counts;
  }, [markers]);

  const rows: LegendRow[] = useMemo(() => {
    const list: LegendRow[] = [
      {
        id: 'self',
        label: 'You',
        count: hasSelf ? 1 : 0,
        swatch: { color: '#22c55e', ring: true },
        available: hasSelf,
      },
      {
        id: 'peers',
        label: 'Group members',
        count: peerCount,
        swatch: { color: '#3b82f6' },
        available: peerCount > 0,
      },
      {
        id: 'sos',
        label: 'SOS alerts',
        count: sosCount,
        swatch: { color: '#ef4444', pulsing: true },
        available: sosCount > 0,
      },
    ];

    for (const k of MARKER_KINDS) {
      const cfg = MARKER_KIND_CONFIG[k];
      const count = markerCountsByKind[k] ?? 0;
      list.push({
        id: `marker:${k}`,
        label: cfg.label,
        count,
        swatch: { color: cfg.color, emoji: cfg.emoji },
        available: count > 0,
      });
    }

    return list;
  }, [hasSelf, peerCount, sosCount, markerCountsByKind]);

  const totalVisibleCount = rows.reduce(
    (acc, row) => (row.available && !hidden.has(row.id) ? acc + (row.count ?? 0) : acc),
    0,
  );

  const anyHidden = rows.some((r) => hidden.has(r.id));

  return (
    <div
      className={`pointer-events-auto ${className}`}
      role="region"
      aria-label="Map legend"
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2 rounded-lg bg-slate-900/90 text-slate-100 shadow-lg backdrop-blur border border-slate-700/70 hover:bg-slate-800 transition-colors ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
          }`}
          aria-expanded={false}
          aria-controls="map-legend-panel"
          title="Show map legend"
        >
          <svg
            className={compact ? 'w-3.5 h-3.5 text-blue-400' : 'w-4 h-4 text-blue-400'}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h10M4 18h7"
            />
          </svg>
          <span className="font-medium">Legend</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-300 tabular-nums">{totalVisibleCount}</span>
        </button>
      ) : (
        <div
          id="map-legend-panel"
          className={`rounded-lg bg-slate-900/95 border border-slate-700/70 shadow-2xl backdrop-blur text-slate-100 ${
            compact ? 'w-56' : 'w-60'
          } max-h-[70vh] flex flex-col`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h10M4 18h7"
                />
              </svg>
              <span className="text-xs font-semibold">Map legend</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-slate-400 hover:text-white text-lg leading-none px-1"
              aria-label="Collapse legend"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="overflow-y-auto py-1">
            {rows.map((row) => {
              const isVisible = !hidden.has(row.id);
              const dimmed = !row.available;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-pressed={isVisible}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-800/70 ${
                    isVisible ? 'text-slate-100' : 'text-slate-500'
                  } ${dimmed ? 'opacity-60' : ''}`}
                >
                  <span className="relative shrink-0">
                    <span
                      className="block w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      style={{
                        background: `${row.swatch.color}26`,
                        color: row.swatch.color,
                        boxShadow: row.swatch.ring
                          ? `0 0 0 2px ${row.swatch.color}99 inset`
                          : undefined,
                      }}
                      aria-hidden="true"
                    >
                      {row.swatch.emoji ?? '●'}
                    </span>
                    {row.swatch.pulsing && row.count !== null && row.count > 0 && (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `${row.swatch.color}40`,
                          animation: 'sosPulse 1.6s ease-out infinite',
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="flex-1 truncate font-medium">{row.label}</span>
                  {row.count !== null && (
                    <span className="text-[11px] tabular-nums text-slate-400 min-w-[1.5ch] text-right">
                      {row.count}
                    </span>
                  )}
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border ${
                      isVisible
                        ? 'border-blue-400/50 bg-blue-500/20 text-blue-300'
                        : 'border-slate-600 text-slate-500'
                    }`}
                    aria-hidden="true"
                    title={isVisible ? 'Hide layer' : 'Show layer'}
                  >
                    {isVisible ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"
                        />
                        <circle cx="12" cy="12" r="3" strokeWidth={2} />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.1A10.3 10.3 0 0112 5c6.5 0 10.5 7 10.5 7-1 1.5-2.4 3.2-4.2 4.5M6.5 6.5C3.5 8.4 1.5 12 1.5 12s4 7 10.5 7c1.4 0 2.7-.3 4-.8"
                        />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-800">
            <button
              type="button"
              onClick={anyHidden ? showAll : hideAll}
              className="flex-1 text-[11px] py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              {anyHidden ? 'Show all' : 'Hide all'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
