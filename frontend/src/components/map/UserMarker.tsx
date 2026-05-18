import L from 'leaflet';
import { Marker } from 'react-leaflet';
import type { LiveLocation } from '../../store/location.store';
import UserPopup from './UserPopup';

interface UserMarkerProps {
  location: LiveLocation;
  isCurrentUser: boolean;
  currentLat?: number;
  currentLng?: number;
  onMessageClick: () => void;
}

function createAvatarIcon(username: string, isCurrentUser: boolean): L.DivIcon {
  const selfClass = isCurrentUser ? 'user-marker--self' : '';
  const html = `
    <div class="user-marker ${selfClass}">
      <img
        src="/icons/default-avatar.svg"
        alt="${username}"
        onerror="this.src='/icons/default-avatar.svg'"
      />
      <span>${username.slice(0, 12)}</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [44, 58],
    iconAnchor: [22, 58],
    popupAnchor: [0, -58],
  });
}

export default function UserMarker({
  location,
  isCurrentUser,
  currentLat,
  currentLng,
  onMessageClick,
}: UserMarkerProps) {
  const icon = createAvatarIcon(location.username, isCurrentUser);

  let distanceKm: number | null = null;
  if (!isCurrentUser && currentLat !== undefined && currentLng !== undefined) {
    const R = 6371;
    const dLat = ((location.lat - currentLat) * Math.PI) / 180;
    const dLng = ((location.lng - currentLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((currentLat * Math.PI) / 180) *
        Math.cos((location.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    distanceKm = 2 * R * Math.asin(Math.sqrt(a));
  }

  return (
    <Marker position={[location.lat, location.lng]} icon={icon}>
      <UserPopup
        location={location}
        distanceKm={distanceKm}
        onMessageClick={onMessageClick}
      />
    </Marker>
  );
}
