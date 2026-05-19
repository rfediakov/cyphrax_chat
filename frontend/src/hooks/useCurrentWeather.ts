import { useEffect, useState } from 'react';
import type { WeatherWidgetConfig } from '../types/navbar-widgets';
import { fetchCurrentWeather, type CurrentWeather } from '../lib/weather';

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: CurrentWeather }>();

function cacheKey(config: WeatherWidgetConfig): string {
  return `${config.latitude},${config.longitude},${config.units}`;
}

export function useCurrentWeather(config: WeatherWidgetConfig) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = cacheKey(config);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      setWeather(hit.data);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    fetchCurrentWeather(config.latitude, config.longitude, config.units)
      .then((data) => {
        if (cancelled) return;
        cache.set(key, { at: Date.now(), data });
        setWeather(data);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.latitude, config.longitude, config.units]);

  return { weather, loading, error };
}
