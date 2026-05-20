import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GroupMap from '../map/GroupMap';
import MapLegend from '../map/MapLegend';
import AddMarkerSheet from '../map/AddMarkerSheet';
import { useAuthStore } from '../../store/auth.store';
import { useLocationStore } from '../../store/location.store';
import { useSOSStore } from '../../store/sos.store';
import { useMarkerStore } from '../../store/marker.store';
import { useMapLayersStore } from '../../store/mapLayers.store';
import { useLocationSharing } from '../../hooks/useLocationSharing';
import { useRoomLiveLocations } from '../../hooks/useRoomLiveLocations';
import { useGlobalLiveLocations } from '../../hooks/useGlobalLiveLocations';
import { useRoomMarkers } from '../../hooks/useRoomMarkers';
import { useMyLocation } from '../../hooks/useMyLocation';
import type { MarkerKind } from '../../lib/markerKinds';
import type { MapMarker } from '../../store/marker.store';

interface ChatMapPanelProps {
  /** Active room id. The panel only renders for room contexts. */
  roomId: string;
}

/**
 * Collapsible mini-map shown above the message list in a chat. Displays every
 * group member who is sharing a location, and lets the user pin their own
 * position (live GPS or manual map click).
 *
 * Designed mobile-first: collapsed by default so the chat keeps full height
 * on phones; expandable to a fixed-height panel.
 */
export default function ChatMapPanel({ roomId }: ChatMapPanelProps) {
  const navigate = useNavigate();

  type ToolMode = 'idle' | 'pin' | 'marker';
  const [expanded, setExpanded] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('idle');
  const [pendingMarker, setPendingMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [savingMarker, setSavingMarker] = useState(false);

  const currentPosition = useLocationStore((s) => s.currentPosition);
  const userLocations = useLocationStore((s) => s.userLocations);
  const currentUserId = useAuthStore((s) => s.user?._id ?? null);
  const sosEvents = useSOSStore((s) => s.activeSOSEvents);
  const resolveSOS = useSOSStore((s) => s.resolveSOS);

  const markersByRoom = useMarkerStore((s) => s.markersByRoom);
  const createMarker = useMarkerStore((s) => s.createMarker);
  const deleteMarker = useMarkerStore((s) => s.deleteMarker);
  const hiddenLayers = useMapLayersStore((s) => s.hidden);

  // Wire up: GPS watcher (only emits when sharingActive is true) + initial
  // hydration of peer positions from the REST endpoint.
  useLocationSharing(roomId);
  useGlobalLiveLocations(expanded);
  useRoomLiveLocations(expanded ? roomId : null);
  useRoomMarkers(expanded ? roomId : null);

  const markers = useMemo(
    () => markersByRoom[roomId] ?? [],
    [markersByRoom, roomId],
  );

  const {
    permission,
    pending,
    error,
    refreshPermission,
    requestAndShareCurrent,
    setManualPosition,
  } = useMyLocation();

  useEffect(() => {
    if (expanded) void refreshPermission();
  }, [expanded, refreshPermission]);

  // Exclude self — the batch broadcast includes everyone in the room, but the
  // current user is already drawn via `selfPosition` so we'd double-pin them.
  const peers = useMemo(
    () =>
      Object.values(userLocations).filter(
        (l) => !currentUserId || l.userId !== currentUserId,
      ),
    [userLocations, currentUserId],
  );

  // SOS events filtered to this room only — global SOSStore stores all rooms.
  const roomSOSEvents = useMemo(
    () => sosEvents.filter((s) => s.roomId === roomId),
    [sosEvents, roomId],
  );

  const handleMapClick =
    toolMode !== 'idle'
      ? async (lat: number, lng: number) => {
          if (toolMode === 'pin') {
            await setManualPosition(lat, lng, roomId);
            setToolMode('idle');
          } else if (toolMode === 'marker') {
            setPendingMarker({ lat, lng });
          }
        }
      : undefined;

  const handleMarkerSubmit = async ({
    kind,
    label,
    description,
  }: {
    kind: MarkerKind;
    label: string;
    description: string;
  }) => {
    if (!pendingMarker) return;
    setSavingMarker(true);
    try {
      await createMarker({
        roomId,
        kind,
        label,
        description,
        lat: pendingMarker.lat,
        lng: pendingMarker.lng,
      });
    } finally {
      setSavingMarker(false);
      setPendingMarker(null);
      setToolMode('idle');
    }
  };

  const handleDeleteMarker = (marker: MapMarker) => {
    void deleteMarker(roomId, marker._id);
  };

  const peerCount = peers.length;

  return (
    <section className="border-b border-gray-700 bg-gray-900 shrink-0">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/60 transition-colors"
        aria-expanded={expanded}
      >
        <svg
          className="w-4 h-4 text-blue-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="flex-1 text-sm font-medium text-gray-200 truncate">
          Common Map
        </span>
        <span className="text-xs text-gray-500">
          {peerCount === 0
            ? 'no one on map'
            : `${peerCount} on map`}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="flex flex-col">
          {/* Tool row */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-t border-gray-800">
            <button
              type="button"
              onClick={() => void requestAndShareCurrent(roomId)}
              disabled={pending || permission === 'unsupported'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 11c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 22s-7-7.58-7-13a7 7 0 1114 0c0 5.42-7 13-7 13z"
                />
              </svg>
              {pending ? 'Locating…' : 'Use my location'}
            </button>

            <button
              type="button"
              onClick={() =>
                setToolMode((m) => (m === 'pin' ? 'idle' : 'pin'))
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                toolMode === 'pin'
                  ? 'bg-amber-500 text-black hover:bg-amber-400'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.55-4.55a2 2 0 10-2.83-2.83L12 7.17m-1.41 8.49l-3.18 3.18a2 2 0 11-2.83-2.83l3.18-3.18M15 10l-7-7m7 7L8 3"
                />
              </svg>
              {toolMode === 'pin' ? 'Tap the map…' : 'Pick on map'}
            </button>

            <button
              type="button"
              onClick={() =>
                setToolMode((m) => (m === 'marker' ? 'idle' : 'marker'))
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                toolMode === 'marker'
                  ? 'bg-blue-500 text-white hover:bg-blue-400'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v14M5 12h14"
                />
              </svg>
              {toolMode === 'marker' ? 'Tap to place' : 'Add marker'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/map')}
              className="ml-auto text-xs text-blue-400 hover:text-blue-300"
            >
              Open full map →
            </button>
          </div>

          {/* Permission / status banners */}
          {permission === 'denied' && (
            <div className="px-3 py-1.5 text-xs text-amber-300 bg-amber-900/30 border-t border-amber-700/40">
              Location permission denied. You can still pin a position manually.
            </div>
          )}
          {permission === 'unsupported' && (
            <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 border-t border-gray-700">
              Geolocation isn't supported on this device. Pin manually instead.
            </div>
          )}
          {error && (
            <div className="px-3 py-1.5 text-xs text-red-300 bg-red-900/30 border-t border-red-700/40">
              {error}
            </div>
          )}
          {toolMode === 'pin' && (
            <div className="px-3 py-1.5 text-xs text-amber-200 bg-amber-900/30 border-t border-amber-700/40">
              Tap anywhere on the map to set your location.
            </div>
          )}
          {toolMode === 'marker' && (
            <div className="px-3 py-1.5 text-xs text-blue-200 bg-blue-900/30 border-t border-blue-700/40">
              Tap the map to drop a shared marker for your group.
            </div>
          )}

          {/* Map */}
          <div
            className={`h-64 sm:h-80 relative ${
              toolMode !== 'idle' ? 'cursor-crosshair' : ''
            }`}
          >
            <GroupMap
              selfPosition={currentPosition}
              peerLocations={peers}
              sosEvents={roomSOSEvents}
              customMarkers={markers}
              currentUserId={currentUserId}
              hiddenLayers={hiddenLayers}
              onMapClick={handleMapClick}
              onResolveSOS={(id) => void resolveSOS(id)}
              onMessagePeer={(userId) => navigate(`/?dialog=${userId}`)}
              onDeleteMarker={handleDeleteMarker}
              followSelf={toolMode !== 'idle' ? 'never' : 'first-fix'}
              showAttribution={false}
            />

            <div className="absolute top-2 left-2 z-[1000]">
              <MapLegend
                hasSelf={!!currentPosition}
                peerCount={peers.length}
                sosCount={roomSOSEvents.length}
                markers={markers}
                compact
              />
            </div>
          </div>
        </div>
      )}

      <AddMarkerSheet
        open={pendingMarker !== null}
        position={pendingMarker}
        busy={savingMarker}
        onCancel={() => {
          setPendingMarker(null);
          setToolMode('idle');
        }}
        onSubmit={handleMarkerSubmit}
      />
    </section>
  );
}
