import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import UserMarker from './UserMarker';
import type { LiveLocation, OwnPosition } from '../../store/location.store';
import type { SOSEvent } from '../../store/sos.store';

// Fix the default Leaflet marker icon paths for Vite's asset pipeline. Runs
// once at module load; subsequent imports are no-ops.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const SOS_ICON = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <div style="
        position:absolute;
        width:40px;height:40px;
        border-radius:50%;
        background:rgba(239,68,68,0.3);
        animation:sosPulse 1.2s ease-out infinite;
      "></div>
      <div style="
        position:relative;
        width:24px;height:24px;
        border-radius:50%;
        background:#ef4444;
        display:flex;align-items:center;justify-content:center;
        font-size:9px;font-weight:bold;color:white;
        box-shadow:0 0 0 3px rgba(239,68,68,0.5);
        z-index:1;
      ">SOS</div>
    </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

interface RecenterProps {
  position: [number, number] | null;
  /** When true, only recenter once (first time `position` becomes non-null). */
  once?: boolean;
}

/**
 * Imperative pan helper. Lives inside <MapContainer> so it has access to the
 * leaflet instance via useMap().
 */
function RecenterOnPosition({ position, once = false }: RecenterProps) {
  const map = useMap();
  const hasRecentered = useRef(false);

  useEffect(() => {
    if (!position) return;
    if (once && hasRecentered.current) return;
    map.setView(position, map.getZoom(), { animate: true });
    hasRecentered.current = true;
  }, [position, once, map]);

  return null;
}

interface ClickHandlerProps {
  onMapClick?: (lat: number, lng: number) => void;
}

function ClickHandler({ onMapClick }: ClickHandlerProps) {
  useMapEvents({
    click: (e: LeafletMouseEvent) => {
      if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export interface GroupMapProps {
  /** Caller's own position (rendered with a self marker + accuracy circle). */
  selfPosition: OwnPosition | null;
  /** Everyone else's latest known positions. */
  peerLocations: LiveLocation[];
  /** Active SOS pins to overlay. Pass [] to disable. */
  sosEvents?: SOSEvent[];
  /**
   * Click handler for manual location setting. When omitted, the map is
   * passive (no click-to-set behaviour).
   */
  onMapClick?: (lat: number, lng: number) => void;
  /** Callback for SOS resolve button inside SOS popups. */
  onResolveSOS?: (sosId: string) => void;
  /** Callback for "Message" button inside peer popups. */
  onMessagePeer?: (userId: string) => void;
  /**
   * Fallback center used when `selfPosition` is null. Defaults to a sensible
   * global view (~London) but callers should set their own for nicer UX.
   */
  fallbackCenter?: [number, number];
  /** Initial zoom level. */
  initialZoom?: number;
  /**
   * Recenter behaviour:
   *  - 'first-fix': recenter once when own position first becomes available
   *  - 'follow': recenter on every position update
   *  - 'never': never recenter automatically (user controls the view)
   */
  followSelf?: 'first-fix' | 'follow' | 'never';
  /** Extra className for outer wrapper. */
  className?: string;
  /** Tile attribution shrinks visually; pass false to hide the attribution box. */
  showAttribution?: boolean;
}

/**
 * Reusable group map. Renders the OpenStreetMap tile layer, the caller's
 * position, peer pins, and (optionally) SOS overlays.
 */
export default function GroupMap({
  selfPosition,
  peerLocations,
  sosEvents = [],
  onMapClick,
  onResolveSOS,
  onMessagePeer,
  fallbackCenter = [51.505, -0.09],
  initialZoom = 13,
  followSelf = 'first-fix',
  className = '',
  showAttribution = true,
}: GroupMapProps) {
  const center: [number, number] = useMemo(
    () =>
      selfPosition
        ? [selfPosition.latitude, selfPosition.longitude]
        : fallbackCenter,
    [selfPosition, fallbackCenter],
  );

  const selfMarkerPos: [number, number] | null = selfPosition
    ? [selfPosition.latitude, selfPosition.longitude]
    : null;

  return (
    <div className={`relative w-full h-full ${className}`}>
      <MapContainer
        center={center}
        zoom={initialZoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        attributionControl={showAttribution}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {followSelf !== 'never' && (
          <RecenterOnPosition position={selfMarkerPos} once={followSelf === 'first-fix'} />
        )}

        {onMapClick && <ClickHandler onMapClick={onMapClick} />}

        {/* Own marker + accuracy circle */}
        {selfPosition && (
          <>
            <UserMarker
              location={{
                userId: 'self',
                username: 'You',
                lat: selfPosition.latitude,
                lng: selfPosition.longitude,
                accuracy: selfPosition.accuracy,
                speed: selfPosition.speed,
                heading: selfPosition.heading,
                updatedAt: selfPosition.updatedAt,
              }}
              isCurrentUser
              onMessageClick={() => undefined}
            />
            {selfPosition.accuracy > 0 && (
              <Circle
                center={[selfPosition.latitude, selfPosition.longitude]}
                radius={selfPosition.accuracy}
                pathOptions={{
                  color: '#22c55e',
                  fillColor: '#22c55e',
                  fillOpacity: 0.15,
                  weight: 1,
                }}
              />
            )}
          </>
        )}

        {/* Peers */}
        {peerLocations.map((loc) => (
          <React.Fragment key={loc.userId}>
            <UserMarker
              location={loc}
              isCurrentUser={false}
              currentLat={selfPosition?.latitude}
              currentLng={selfPosition?.longitude}
              onMessageClick={() => onMessagePeer?.(loc.userId)}
            />
            {loc.accuracy > 0 && (
              <Circle
                center={[loc.lat, loc.lng]}
                radius={loc.accuracy}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.12,
                  weight: 1,
                }}
              />
            )}
          </React.Fragment>
        ))}

        {/* SOS overlays */}
        {sosEvents.map((sos) => (
          <Marker
            key={sos._id}
            position={[sos.lat, sos.lng]}
            icon={SOS_ICON}
            zIndexOffset={1000}
          >
            <Popup>
              <div className="text-sm p-1 min-w-[160px]">
                <p className="font-bold text-red-600 mb-1">SOS — {sos.username}</p>
                <p className="text-slate-700 italic mb-2">"{sos.message}"</p>
                <p className="text-slate-500 text-xs mb-2">
                  {new Date(sos.createdAt).toLocaleTimeString()}
                </p>
                {onResolveSOS && (
                  <button
                    type="button"
                    onClick={() => onResolveSOS(sos._id)}
                    className="w-full py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                  >
                    Mark as Resolved
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
