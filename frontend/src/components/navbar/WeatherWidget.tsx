import type { WeatherWidgetConfig } from '../../types/navbar-widgets';
import { useCurrentWeather } from '../../hooks/useCurrentWeather';
import { formatTemperature, weatherCodeToInfo } from '../../lib/weather';

interface WeatherWidgetProps {
  config: WeatherWidgetConfig;
  compact?: boolean;
}

export function WeatherWidget({ config, compact }: WeatherWidgetProps) {
  const { weather, loading, error } = useCurrentWeather(config);

  const info = weather ? weatherCodeToInfo(weather.weatherCode, weather.isDay) : null;
  const temp = weather ? formatTemperature(weather.temperature, config.units) : '—';
  const variant = weather?.isDay === false ? 'night' : 'day';

  const label = config.locationLabel.split(',')[0]?.trim() || config.locationLabel;

  return (
    <div
      className={`nav-widget nav-widget--weather nav-widget--weather-${variant} ${
        compact ? 'nav-widget--compact' : ''
      } ${loading ? 'nav-widget--loading' : ''} ${error ? 'nav-widget--error' : ''}`}
      aria-label={
        weather
          ? `Weather in ${config.locationLabel}: ${info?.label}, ${temp}`
          : `Weather in ${config.locationLabel}`
      }
    >
      <span className="nav-widget__weather-emoji" aria-hidden>
        {loading ? (
          <span className="nav-widget__shimmer" />
        ) : error ? (
          '⚠️'
        ) : (
          info?.emoji ?? '🌡️'
        )}
      </span>
      <span className="nav-widget__weather-body">
        <span className="nav-widget__weather-temp">{loading && !weather ? '…' : temp}</span>
        {!compact && (
          <span className="nav-widget__weather-meta">
            <span className="nav-widget__weather-city">{label}</span>
            {info && !error && (
              <span className="nav-widget__weather-desc">{info.label}</span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
