import { Popup } from 'react-leaflet';
import type { LiveLocation } from '../../store/location.store';

interface UserPopupProps {
  location: LiveLocation;
  distanceKm: number | null;
  onMessageClick: () => void;
}

function formatSecondsAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function UserPopup({ location, distanceKm, onMessageClick }: UserPopupProps) {
  const speedKmh =
    location.speed !== null ? (location.speed * 3.6).toFixed(1) : null;
  const distanceStr =
    distanceKm !== null
      ? distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m away`
        : `~${distanceKm.toFixed(1)} km away`
      : null;

  return (
    <Popup>
      <div className="flex flex-col gap-2 min-w-[180px]">
        <div className="flex items-center gap-2">
          <img
            src="/icons/default-avatar.svg"
            alt={location.username}
            className="w-10 h-10 rounded-full border-2 border-blue-400 object-cover bg-slate-700"
          />
          <span className="font-semibold text-slate-900">{location.username}</span>
        </div>

        <div className="text-sm text-slate-600 space-y-0.5">
          {distanceStr && (
            <p>
              <span className="text-green-600 font-medium">Online</span>
              {' • '}
              {distanceStr}
            </p>
          )}
          {speedKmh !== null && <p>Speed: {speedKmh} km/h</p>}
          <p>Updated: {formatSecondsAgo(location.updatedAt)}</p>
        </div>

        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onMessageClick}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            <span>💬</span> Message
          </button>
        </div>
      </div>
    </Popup>
  );
}
