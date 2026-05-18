let watchId: number | null = null;

export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator;
}

export function startWatching(
  onUpdate: (pos: GeolocationPosition) => void,
  onError: (e: GeolocationPositionError) => void,
): void {
  if (!isGeolocationSupported()) return;
  stopWatching();
  watchId = navigator.geolocation.watchPosition(onUpdate, onError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5000,
  });
}

export function stopWatching(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

/** One-shot current position */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }),
  );
}

/** Haversine distance in metres between two lat/lng pairs */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
