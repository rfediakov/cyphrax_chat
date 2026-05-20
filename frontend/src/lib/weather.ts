/** WMO weather interpretation codes (Open-Meteo) */
export function weatherCodeToInfo(code: number, isDay: boolean): { emoji: string; label: string } {
  if (code === 0) return { emoji: isDay ? '☀️' : '🌙', label: 'Clear' };
  if (code <= 3) return { emoji: isDay ? '⛅' : '☁️', label: 'Partly cloudy' };
  if (code <= 48) return { emoji: '🌫️', label: 'Foggy' };
  if (code <= 57) return { emoji: '🌦️', label: 'Drizzle' };
  if (code <= 67) return { emoji: '🌧️', label: 'Rain' };
  if (code <= 77) return { emoji: '🌨️', label: 'Snow' };
  if (code <= 82) return { emoji: '🌧️', label: 'Showers' };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  if (code <= 99) return { emoji: '⛈️', label: 'Thunderstorm' };
  return { emoji: '🌡️', label: 'Unknown' };
}

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export async function searchLocations(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error('Location search failed');
  const data = (await res.json()) as { results?: GeocodeResult[] };
  return data.results ?? [];
}

export interface CurrentWeather {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  windSpeed: number;
}

export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  units: 'celsius' | 'fahrenheit',
): Promise<CurrentWeather> {
  const temperatureUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
    temperature_unit: temperatureUnit,
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Weather fetch failed');

  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      weather_code: number;
      is_day: number;
      wind_speed_10m: number;
    };
  };

  const c = data.current;
  return {
    temperature: c.temperature_2m,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
    windSpeed: c.wind_speed_10m,
  };
}

export function formatTemperature(value: number, units: 'celsius' | 'fahrenheit'): string {
  const rounded = Math.round(value);
  return units === 'fahrenheit' ? `${rounded}°F` : `${rounded}°C`;
}
