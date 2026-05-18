import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Circle } from 'react-leaflet';
import axios from 'axios';
import { useLocationStore } from '../store/location.store';
import { useChatStore } from '../store/chat.store';
import { useLocationSharing } from '../hooks/useLocationSharing';
import UserMarker from '../components/map/UserMarker';

// Fix default Leaflet marker icon for Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

interface HistoryEntry {
  _id: string;
  lat: number;
  lng: number;
  recordedAt: string;
  accuracy: number;
}

export default function Map() {
  const navigate = useNavigate();
  const rooms = useChatStore((s) => s.rooms);

  const sharingActive = useLocationStore((s) => s.sharingActive);
  const setSharingActive = useLocationStore((s) => s.setSharingActive);
  const currentPosition = useLocationStore((s) => s.currentPosition);
  const userLocations = useLocationStore((s) => s.userLocations);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Wire up the location sharing hook
  useLocationSharing(activeRoomId);

  const defaultCenter: [number, number] =
    currentPosition
      ? [currentPosition.latitude, currentPosition.longitude]
      : [51.505, -0.09];

  const handleShareToggle = useCallback(async () => {
    const next = !sharingActive;
    setSharingActive(next);
    try {
      await axios.patch(
        '/api/v1/location/sharing',
        {
          active: next,
          roomIds: activeRoomId ? [activeRoomId] : [],
        },
        { withCredentials: true },
      );
    } catch (err) {
      console.warn('[Map] Failed to persist sharing state:', err);
    }
  }, [sharingActive, setSharingActive, activeRoomId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await axios.get<{ locations: HistoryEntry[] }>(
        '/api/v1/location/history?limit=50',
        { withCredentials: true },
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

  const locationsList = Object.values(userLocations);

  return (
    <div className="flex flex-col h-screen bg-slate-900">
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
            className={`w-2 h-2 rounded-full ${sharingActive ? 'bg-green-300 animate-pulse' : 'bg-slate-500'}`}
          />
          {sharingActive ? 'Sharing' : 'Share'}
        </button>
      </div>

      {/* Map container */}
      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* Current user — self marker */}
          {currentPosition && (
            <>
              <UserMarker
                location={{
                  userId: 'self',
                  username: 'You',
                  lat: currentPosition.latitude,
                  lng: currentPosition.longitude,
                  accuracy: currentPosition.accuracy,
                  speed: currentPosition.speed,
                  heading: currentPosition.heading,
                  updatedAt: Date.now(),
                }}
                isCurrentUser
                onMessageClick={() => undefined}
              />
              {currentPosition.accuracy > 0 && (
                <Circle
                  center={[currentPosition.latitude, currentPosition.longitude]}
                  radius={currentPosition.accuracy}
                  pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.15, weight: 1 }}
                />
              )}
            </>
          )}

          {/* Other users */}
          {locationsList.map((loc) => (
            <React.Fragment key={loc.userId}>
              <UserMarker
                location={loc}
                isCurrentUser={false}
                currentLat={currentPosition?.latitude}
                currentLng={currentPosition?.longitude}
                onMessageClick={() => navigate(`/?dialog=${loc.userId}`)}
              />
              {loc.accuracy > 0 && (
                <Circle
                  center={[loc.lat, loc.lng]}
                  radius={loc.accuracy}
                  pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1 }}
                />
              )}
            </React.Fragment>
          ))}
        </MapContainer>

        {/* History button */}
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="absolute bottom-4 left-4 z-[1000] flex items-center gap-1.5 px-3 py-2 bg-slate-900 bg-opacity-90 text-slate-200 rounded-lg text-sm font-medium shadow-lg hover:bg-slate-800 transition-colors"
        >
          📍 History
        </button>
      </div>

      {/* History drawer */}
      {showHistory && (
        <div className="fixed bottom-0 left-0 right-0 z-[2000] h-64 bg-slate-900 border-t border-slate-700 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <h3 className="text-slate-200 font-medium text-sm">Location History</h3>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-slate-400 hover:text-white text-lg leading-none"
            >
              ✕
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
