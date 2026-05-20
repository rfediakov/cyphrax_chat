import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import { getMarkerKindConfig, type MarkerKind } from '../../lib/markerKinds';
import type { MapMarker } from '../../store/marker.store';

interface CustomMarkerProps {
  marker: MapMarker;
  isOwn: boolean;
  /** Distance from the caller to this marker, in km, when available. */
  distanceKm: number | null;
  onDelete?: (marker: MapMarker) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildIcon(kind: MarkerKind, label: string, color: string): L.DivIcon {
  const cfg = getMarkerKindConfig(kind);
  const safeLabel = escapeHtml(label).slice(0, 20);
  const html = `
    <div class="custom-marker" style="--mk-color:${color};">
      <div class="custom-marker__pin">
        <span class="custom-marker__emoji" aria-hidden="true">${cfg.emoji}</span>
      </div>
      <span class="custom-marker__label">${safeLabel}</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [40, 56],
    iconAnchor: [20, 50],
    popupAnchor: [0, -48],
  });
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, now - then);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export default function CustomMarker({
  marker,
  isOwn,
  distanceKm,
  onDelete,
}: CustomMarkerProps) {
  const cfg = getMarkerKindConfig(marker.kind);
  const color = marker.color ?? cfg.color;
  const icon = buildIcon(marker.kind, marker.label, color);

  return (
    <Marker position={[marker.lat, marker.lng]} icon={icon}>
      <Popup>
        <div className="text-sm min-w-[180px] max-w-[240px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-base shrink-0"
              style={{ background: `${color}22`, color }}
              aria-hidden="true"
            >
              {cfg.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">{marker.label}</p>
              <p className="text-[11px] text-slate-500 truncate">{cfg.label}</p>
            </div>
          </div>

          {marker.description && (
            <p className="text-slate-700 text-xs mb-2 whitespace-pre-wrap break-words">
              {marker.description}
            </p>
          )}

          <p className="text-[11px] text-slate-500 mb-2">
            <span className="font-medium text-slate-700">{marker.username}</span>
            <span aria-hidden="true"> · </span>
            <span>{formatRelative(marker.createdAt)}</span>
            {distanceKm !== null && (
              <>
                <span aria-hidden="true"> · </span>
                <span>
                  {distanceKm < 1
                    ? `${Math.round(distanceKm * 1000)} m`
                    : `${distanceKm.toFixed(1)} km`}
                </span>
              </>
            )}
          </p>

          {isOwn && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(marker)}
              className="w-full py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
            >
              Delete marker
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
