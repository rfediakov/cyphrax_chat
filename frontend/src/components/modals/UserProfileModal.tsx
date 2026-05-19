import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

import { useChatStore } from '../../store/chat.store';
import { useLocationStore } from '../../store/location.store';
import { useTelemetryStore } from '../../store/telemetry.store';
import { useCallsStore } from '../../store/calls.store';
import { usePresence } from '../../hooks/usePresence';
import { useToast } from '../ui/Toast';
import { getContacts, normalizeContact, type Contact } from '../../api/contacts.api';
import UserAvatar from '../ui/UserAvatar';
import BatteryIndicator from '../ui/BatteryIndicator';

// Leaflet default-icon fix for Vite — safe to call repeatedly
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

type PresenceStatus = 'online' | 'afk' | 'offline';

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  afk: 'Away',
  offline: 'Offline',
};

const STATUS_DOT: Record<PresenceStatus, string> = {
  online: 'bg-green-400',
  afk: 'bg-amber-400',
  offline: 'bg-gray-500',
};

const STATUS_TEXT: Record<PresenceStatus, string> = {
  online: 'text-green-400',
  afk: 'text-amber-400',
  offline: 'text-gray-500',
};

interface UserProfileModalProps {
  userId: string;
  username: string;
  /** Optional contextual role to render under the name */
  subtitle?: string;
  onClose: () => void;
}

/** Format the time elapsed since `timestamp` (ms) in a short label. */
function formatAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Haversine great-circle distance in metres. */
function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function UserProfileModal({ userId, username, subtitle, onClose }: UserProfileModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { getStatus } = usePresence();

  const setActiveDialog = useChatStore((s) => s.setActiveDialog);
  const telemetry = useTelemetryStore((s) => s.entries[userId]);
  const location = useLocationStore((s) => s.userLocations[userId]);
  const currentPosition = useLocationStore((s) => s.currentPosition);
  const startCall = useCallsStore((s) => s.startCall);

  const [contact, setContact] = useState<Contact | null>(null);

  const status = getStatus(userId);

  useEffect(() => {
    let cancelled = false;
    getContacts()
      .then((res) => {
        if (cancelled) return;
        const found = (res.data.contacts ?? [])
          .map(normalizeContact)
          .find((c) => c && c._id === userId);
        setContact(found ?? null);
      })
      .catch(() => {
        // Non-blocking — profile still renders without email.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Escape key closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const distanceLabel = useMemo(() => {
    if (!location || !currentPosition) return null;
    const m = distanceMetres(
      { lat: currentPosition.latitude, lng: currentPosition.longitude },
      { lat: location.lat, lng: location.lng },
    );
    return formatDistance(m);
  }, [location, currentPosition]);

  const speedKmh = location?.speed != null ? (location.speed * 3.6).toFixed(1) : null;

  const handleSendMessage = () => {
    setActiveDialog(userId);
    onClose();
    navigate('/');
  };

  const handleOpenMap = () => {
    onClose();
    navigate('/map');
  };

  const handleCall = async (type: 'audio' | 'video') => {
    try {
      await startCall({ peerId: userId, peerUsername: username, type, calleeId: userId });
      onClose();
    } catch {
      showToast('Could not start the call. Try again later.', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Profile of ${username}`}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-gray-900 border-t border-gray-700 sm:border sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-[slideUp_180ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle — mobile bottom-sheet affordance */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <span className="block h-1 w-10 rounded-full bg-gray-700" aria-hidden="true" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 sm:pt-5 pb-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <UserAvatar username={username} size="xl" />
              <span
                className={`absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${STATUS_DOT[status]}`}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-white truncate">@{username}</p>
              <p className={`text-xs font-medium ${STATUS_TEXT[status]}`}>● {STATUS_LABEL[status]}</p>
              {subtitle && (
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors shrink-0"
            aria-label="Close profile"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Contact info */}
          <Section title="Contact info">
            <InfoRow
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              }
              label="Username"
              value={username}
            />
            {contact?.email && (
              <InfoRow
                icon={
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                }
                label="Email"
                value={contact.email}
              />
            )}
            {telemetry?.recordedAt && (
              <InfoRow
                icon={
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                }
                label="Last active"
                value={formatAgo(new Date(telemetry.recordedAt).getTime())}
              />
            )}
          </Section>

          {/* Device status */}
          {(telemetry?.battery || telemetry?.network) && (
            <Section title="Device status">
              <div className="grid grid-cols-2 gap-2">
                {telemetry?.battery && (
                  <Tile label="Battery">
                    <BatteryIndicator
                      level={telemetry.battery.level}
                      charging={telemetry.battery.charging}
                      size="md"
                    />
                  </Tile>
                )}
                {telemetry?.network && (
                  <Tile label="Network">
                    <NetworkLabel
                      online={telemetry.network.online}
                      effectiveType={telemetry.network.effectiveType}
                      downlink={telemetry.network.downlink}
                    />
                  </Tile>
                )}
              </div>
            </Section>
          )}

          {/* Location */}
          <Section
            title="Location"
            action={
              location && (
                <button
                  type="button"
                  onClick={handleOpenMap}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Open map →
                </button>
              )
            }
          >
            {location ? (
              <div className="space-y-2">
                <div className="rounded-lg overflow-hidden border border-gray-700 h-40">
                  <MapContainer
                    key={`${location.lat}-${location.lng}`}
                    center={[location.lat, location.lng]}
                    zoom={14}
                    zoomControl={false}
                    attributionControl={false}
                    scrollWheelZoom={false}
                    dragging={false}
                    doubleClickZoom={false}
                    touchZoom={false}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[location.lat, location.lng]} />
                    {location.accuracy > 0 && (
                      <Circle
                        center={[location.lat, location.lng]}
                        radius={location.accuracy}
                        pathOptions={{
                          color: '#3b82f6',
                          fillColor: '#3b82f6',
                          fillOpacity: 0.15,
                          weight: 1,
                        }}
                      />
                    )}
                  </MapContainer>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {distanceLabel && (
                    <Tile label="Distance">
                      <span className="text-sm text-white font-medium">{distanceLabel} away</span>
                    </Tile>
                  )}
                  {speedKmh !== null && (
                    <Tile label="Speed">
                      <span className="text-sm text-white font-medium">{speedKmh} km/h</span>
                    </Tile>
                  )}
                  <Tile label="Accuracy">
                    <span className="text-sm text-white font-medium">±{Math.round(location.accuracy)} m</span>
                  </Tile>
                  <Tile label="Updated">
                    <span className="text-sm text-white font-medium">{formatAgo(location.updatedAt)}</span>
                  </Tile>
                </div>
                <p className="text-[11px] text-gray-500 font-mono">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 px-3 py-4 text-center">
                <p className="text-xs text-gray-400">Location is not shared by this user.</p>
                <button
                  type="button"
                  onClick={handleOpenMap}
                  className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Open map →
                </button>
              </div>
            )}
          </Section>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-gray-700 shrink-0 bg-gray-900/95 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSendMessage}
            className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Send Message
          </button>

          <ActionTile
            onClick={() => handleCall('audio')}
            label="Audio call"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V8a1 1 0 01-1 1H8.5a11.5 11.5 0 007 7V14a1 1 0 011-1h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-1C9.163 21 3 14.837 3 7V6z" />
            }
          />
          <ActionTile
            onClick={() => handleCall('video')}
            label="Video call"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            }
          />
          <ActionTile
            onClick={handleOpenMap}
            label="View on map"
            colSpan
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            }
          />
        </div>
      </div>
    </div>
  );
}

/* -------- internal building blocks -------- */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {icon}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
        <p className="text-sm text-gray-200 truncate">{value}</p>
      </div>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function NetworkLabel({
  online,
  effectiveType,
  downlink,
}: {
  online: boolean;
  effectiveType: string;
  downlink: number | null;
}) {
  if (!online) return <span className="text-sm font-medium text-red-400">Offline</span>;
  return (
    <span className="text-sm font-medium text-gray-200">
      {effectiveType?.toUpperCase() || '—'}
      {downlink != null && <span className="text-gray-500 font-normal"> · {downlink} Mb/s</span>}
    </span>
  );
}

function ActionTile({
  onClick,
  label,
  icon,
  colSpan,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  colSpan?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${
        colSpan ? 'col-span-2' : ''
      } flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {icon}
      </svg>
      {label}
    </button>
  );
}

export default UserProfileModal;
