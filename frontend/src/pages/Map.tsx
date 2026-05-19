import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GroupMap from '../components/map/GroupMap';
import MapLegend from '../components/map/MapLegend';
import AddMarkerSheet from '../components/map/AddMarkerSheet';
import { useAuthStore } from '../store/auth.store';
import { useLocationStore } from '../store/location.store';
import { useChatStore } from '../store/chat.store';
import { useSOSStore } from '../store/sos.store';
import { useMarkerStore } from '../store/marker.store';
import { useMapLayersStore } from '../store/mapLayers.store';
import { useLocationSharing } from '../hooks/useLocationSharing';
import { useRoomLiveLocations } from '../hooks/useRoomLiveLocations';
import { useRoomMarkers } from '../hooks/useRoomMarkers';
import { useMyLocation } from '../hooks/useMyLocation';
import { updateSharing } from '../api/location.api';
import api from '../api/axios';
import type { MarkerKind } from '../lib/markerKinds';
import type { MapMarker } from '../store/marker.store';

interface HistoryEntry {
  _id: string;
  lat: number;
  lng: number;
  recordedAt: string;
  accuracy: number;
}

/**
 * Full-screen map page. Always tries to center on the caller's location and
 * prompts for permission on entry. Falls back to a manual map pin when the
 * permission is denied or geolocation isn't supported.
 */
export default function Map() {
  const navigate = useNavigate();
  const rooms = useChatStore((s) => s.rooms);

  const sharingActive = useLocationStore((s) => s.sharingActive);
  const setSharingActive = useLocationStore((s) => s.setSharingActive);
  const currentPosition = useLocationStore((s) => s.currentPosition);
  const userLocations = useLocationStore((s) => s.userLocations);
  const currentUserId = useAuthStore((s) => s.user?._id ?? null);
  const sosEvents = useSOSStore((s) => s.activeSOSEvents);
  const resolveSOS = useSOSStore((s) => s.resolveSOS);

  const markersByRoom = useMarkerStore((s) => s.markersByRoom);
  const createMarker = useMarkerStore((s) => s.createMarker);
  const deleteMarker = useMarkerStore((s) => s.deleteMarker);
  const hiddenLayers = useMapLayersStore((s) => s.hidden);

  type ToolMode = 'idle' | 'pin' | 'marker';

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('idle');
  const [pendingMarker, setPendingMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [savingMarker, setSavingMarker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Default the room selector to "Random" (or the first room) so the caller
  // immediately sees companions on the map without having to fiddle.
  useEffect(() => {
    if (activeRoomId || rooms.length === 0) return;
    const random = rooms.find((r) => r.name === 'Random');
    setActiveRoomId(random?._id ?? rooms[0]._id);
  }, [rooms, activeRoomId]);

  useLocationSharing(activeRoomId);
  useRoomLiveLocations(activeRoomId);
  useRoomMarkers(activeRoomId);

  const markers = useMemo(
    () => (activeRoomId ? markersByRoom[activeRoomId] ?? [] : []),
    [markersByRoom, activeRoomId],
  );

  const {
    permission,
    pending,
    error,
    refreshPermission,
    requestAndShareCurrent,
    setManualPosition,
  } = useMyLocation();

  // On mount: probe permission and immediately try to acquire a fix. Browsers
  // surface the OS permission prompt only inside this user-initiated nav, so
  // we kick it off as soon as the route mounts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await refreshPermission();
      if (cancelled) return;
      if (state === 'granted' || state === 'prompt' || state === 'unknown') {
        await requestAndShareCurrent(activeRoomId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only on mount — repeated calls would re-prompt the user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter out our own entry — `selfPosition` renders us separately.
  const peers = useMemo(
    () =>
      Object.values(userLocations).filter(
        (l) => !currentUserId || l.userId !== currentUserId,
      ),
    [userLocations, currentUserId],
  );

  const handleShareToggle = useCallback(async () => {
    const next = !sharingActive;
    setSharingActive(next);
    try {
      await updateSharing({
        active: next,
        roomIds: activeRoomId ? [activeRoomId] : [],
      });
    } catch (err) {
      console.warn('[Map] Failed to persist sharing state:', err);
    }
  }, [sharingActive, setSharingActive, activeRoomId]);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (toolMode === 'pin') {
        await setManualPosition(lat, lng, activeRoomId);
        setToolMode('idle');
      } else if (toolMode === 'marker') {
        if (!activeRoomId) return;
        setPendingMarker({ lat, lng });
      }
    },
    [toolMode, setManualPosition, activeRoomId],
  );

  const handleMarkerSubmit = useCallback(
    async ({
      kind,
      label,
      description,
    }: {
      kind: MarkerKind;
      label: string;
      description: string;
    }) => {
      if (!pendingMarker || !activeRoomId) return;
      setSavingMarker(true);
      try {
        await createMarker({
          roomId: activeRoomId,
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
    },
    [pendingMarker, activeRoomId, createMarker],
  );

  const handleDeleteMarker = useCallback(
    (marker: MapMarker) => {
      if (!activeRoomId) return;
      void deleteMarker(activeRoomId, marker._id);
    },
    [activeRoomId, deleteMarker],
  );

  const followBehaviour: 'never' | 'first-fix' =
    toolMode === 'idle' ? 'first-fix' : 'never';

  const cursorClass =
    toolMode === 'pin' || toolMode === 'marker' ? 'cursor-crosshair' : '';

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get<{ locations: HistoryEntry[] }>(
        '/location/history',
        { params: { limit: 50 } },
      );
      setHistory(data.locations);
    } catch (err) {
      console.warn('[Map] Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory) void loadHistory();
  }, [showHistory, loadHistory]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-900">
      {/* Top bar */}
      <div className="flex items-center gap-2 h-12 px-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors text-sm"
        >
          ← Back
        </button>

        <div className="flex-1 flex items-center gap-1 min-w-0">
          <span className="text-slate-400 text-xs shrink-0">Room:</span>
          <select
            value={activeRoomId ?? ''}
            onChange={(e) => setActiveRoomId(e.target.value || null)}
            className="flex-1 min-w-0 bg-slate-800 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">None</option>
            {(rooms ?? []).map((room) => (
              <option key={room._id} value={room._id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleShareToggle()}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
            sharingActive
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              sharingActive ? 'bg-green-300 animate-pulse' : 'bg-slate-500'
            }`}
          />
          {sharingActive ? 'Sharing' : 'Share'}
        </button>
      </div>

      {/* Permission / status banners */}
      {permission === 'denied' && (
        <div className="px-3 py-1.5 text-xs text-amber-200 bg-amber-900/40 border-b border-amber-700/40">
          Location permission denied. Pin your position manually with{' '}
          <span className="font-semibold">Pick on map</span> below.
        </div>
      )}
      {permission === 'unsupported' && (
        <div className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 border-b border-slate-700">
          Geolocation isn't supported on this device. Pin manually instead.
        </div>
      )}
      {error && permission !== 'denied' && (
        <div className="px-3 py-1.5 text-xs text-red-200 bg-red-900/40 border-b border-red-700/40">
          {error}
        </div>
      )}

      {/* Map container */}
      <div className={`flex-1 relative ${cursorClass}`}>
        <GroupMap
          selfPosition={currentPosition}
          peerLocations={peers}
          sosEvents={sosEvents}
          customMarkers={markers}
          currentUserId={currentUserId}
          hiddenLayers={hiddenLayers}
          onMapClick={toolMode !== 'idle' ? handleMapClick : undefined}
          onResolveSOS={(id) => void resolveSOS(id)}
          onMessagePeer={(userId) => navigate(`/?dialog=${userId}`)}
          onDeleteMarker={handleDeleteMarker}
          followSelf={followBehaviour}
        />

        {/* Legend (top-left) */}
        <div className="absolute top-3 left-3 z-[1000]">
          <MapLegend
            hasSelf={!!currentPosition}
            peerCount={peers.length}
            sosCount={sosEvents.length}
            markers={markers}
          />
        </div>

        {/* Floating controls (top-right) */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void requestAndShareCurrent(activeRoomId)}
            disabled={pending || permission === 'unsupported'}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/90 backdrop-blur text-slate-100 text-xs font-medium shadow-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
            title="Use device location"
          >
            <svg
              className="w-4 h-4 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="3" strokeWidth={2} />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 2v3M12 19v3M2 12h3M19 12h3"
              />
            </svg>
            {pending ? 'Locating…' : 'My location'}
          </button>

          <button
            type="button"
            onClick={() =>
              setToolMode((m) => (m === 'pin' ? 'idle' : 'pin'))
            }
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium shadow-lg backdrop-blur transition-colors ${
              toolMode === 'pin'
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'bg-slate-900/90 text-slate-100 hover:bg-slate-800'
            }`}
            title={
              toolMode === 'pin'
                ? 'Tap the map to drop a pin'
                : 'Pick your own location on map'
            }
          >
            <svg
              className="w-4 h-4"
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
            {toolMode === 'pin' ? 'Tap to drop' : 'Pick on map'}
          </button>

          <button
            type="button"
            onClick={() =>
              setToolMode((m) => (m === 'marker' ? 'idle' : 'marker'))
            }
            disabled={!activeRoomId}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium shadow-lg backdrop-blur transition-colors disabled:opacity-50 ${
              toolMode === 'marker'
                ? 'bg-blue-500 text-white hover:bg-blue-400'
                : 'bg-slate-900/90 text-slate-100 hover:bg-slate-800'
            }`}
            title={
              !activeRoomId
                ? 'Pick a room first to share markers'
                : toolMode === 'marker'
                ? 'Tap the map to drop a marker'
                : 'Add a shared marker'
            }
          >
            <svg
              className="w-4 h-4"
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
        </div>

        {/* History button */}
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="absolute bottom-4 left-4 z-[1000] flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 text-slate-200 rounded-lg text-sm font-medium shadow-lg hover:bg-slate-800 transition-colors backdrop-blur"
        >
          History
        </button>

        {toolMode === 'pin' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-lg text-xs text-amber-200 bg-amber-900/80 backdrop-blur shadow-lg">
            Tap anywhere on the map to set your location.
          </div>
        )}
        {toolMode === 'marker' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-lg text-xs text-blue-100 bg-blue-900/80 backdrop-blur shadow-lg">
            Tap the map to drop a shared marker.
          </div>
        )}
      </div>

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

      {/* History drawer */}
      {showHistory && (
        <div className="fixed bottom-0 left-0 right-0 z-[2000] h-64 bg-slate-900 border-t border-slate-700 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <h3 className="text-slate-200 font-medium text-sm">Location History</h3>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              aria-label="Close location history"
              className="text-slate-400 hover:text-white text-lg leading-none"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {historyLoading && (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Loading…
              </div>
            )}
            {!historyLoading && history.length === 0 && (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No location history
              </div>
            )}
            {!historyLoading &&
              history.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800"
                >
                  <div className="text-slate-300 text-xs">
                    {new Date(entry.recordedAt).toLocaleString()}
                  </div>
                  <div className="text-slate-400 text-xs font-mono">
                    {entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
