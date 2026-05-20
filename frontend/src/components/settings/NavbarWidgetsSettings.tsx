import { useCallback, useEffect, useState } from 'react';
import type {
  ClockWidgetConfig,
  NavbarWidget,
  WeatherWidgetConfig,
} from '../../types/navbar-widgets';
import { useNavbarWidgetsStore } from '../../store/navbar-widgets.store';
import { searchLocations, type GeocodeResult } from '../../lib/weather';
import { ClockWidget } from '../navbar/ClockWidget';
import { WeatherWidget } from '../navbar/WeatherWidget';

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
      {title && <h2 className="text-sm font-bold text-white mb-4">{title}</h2>}
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          checked ? 'bg-cyan-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export function NavbarWidgetsSettings() {
  const widgets = useNavbarWidgetsStore((s) => s.widgets);
  const addWidget = useNavbarWidgetsStore((s) => s.addWidget);
  const removeWidget = useNavbarWidgetsStore((s) => s.removeWidget);
  const setWidgetEnabled = useNavbarWidgetsStore((s) => s.setWidgetEnabled);
  const moveWidget = useNavbarWidgetsStore((s) => s.moveWidget);

  const hasClock = widgets.some((w) => w.type === 'clock');
  const hasWeather = widgets.some((w) => w.type === 'weather');

  return (
    <div className="space-y-4">
      <SectionCard title="Navbar preview">
        <p className="text-xs text-gray-500 mb-3">
          Widgets appear in the top bar on tablet and desktop. Reorder with the arrows below.
        </p>
        <div className="flex flex-wrap items-center gap-2 min-h-[44px] p-3 rounded-xl bg-gray-950/80 border border-gray-800">
          {widgets.filter((w) => w.enabled).length === 0 ? (
            <span className="text-xs text-gray-500 italic">No active widgets</span>
          ) : (
            widgets
              .filter((w) => w.enabled)
              .map((w) =>
                w.type === 'clock' ? (
                  <ClockWidget key={w.id} config={w.config} />
                ) : (
                  <WeatherWidget key={w.id} config={w.config} />
                ),
              )
          )}
        </div>
      </SectionCard>

      <SectionCard title="Your widgets">
        {widgets.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">
            Add a live clock, local weather, or both to personalize your navbar.
          </p>
        ) : (
          <ul className="space-y-3 mb-4">
            {widgets.map((widget, index) => (
              <WidgetEditor
                key={widget.id}
                widget={widget}
                index={index}
                total={widgets.length}
                onRemove={() => removeWidget(widget.id)}
                onToggleEnabled={(v) => setWidgetEnabled(widget.id, v)}
                onMoveUp={() => moveWidget(widget.id, 'up')}
                onMoveDown={() => moveWidget(widget.id, 'down')}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addWidget('clock')}
            disabled={hasClock}
            className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-sm font-medium bg-gradient-to-br from-cyan-600/90 to-blue-700 text-white hover:from-cyan-500 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-900/20"
          >
            + Clock
          </button>
          <button
            type="button"
            onClick={() => addWidget('weather')}
            disabled={hasWeather}
            className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-sm font-medium bg-gradient-to-br from-amber-500/90 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-900/20"
          >
            + Weather
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Weather data from{' '}
          <a
            href="https://open-meteo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-500/80 hover:text-cyan-400"
          >
            Open-Meteo
          </a>
          . No API key required.
        </p>
      </SectionCard>
    </div>
  );
}

function WidgetEditor({
  widget,
  index,
  total,
  onRemove,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
}: {
  widget: NavbarWidget;
  index: number;
  total: number;
  onRemove: () => void;
  onToggleEnabled: (v: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const title = widget.type === 'clock' ? 'Clock' : 'Weather';
  const icon = widget.type === 'clock' ? '🕐' : '🌤️';

  return (
    <li className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-lg" aria-hidden>
          {icon}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left text-sm font-medium text-white"
        >
          {title}
          {!widget.enabled && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">Hidden</span>
          )}
        </button>
        <div className="flex items-center gap-0.5">
          <IconBtn label="Move up" onClick={onMoveUp} disabled={index === 0}>
            ↑
          </IconBtn>
          <IconBtn label="Move down" onClick={onMoveDown} disabled={index === total - 1}>
            ↓
          </IconBtn>
          <IconBtn label="Remove widget" onClick={onRemove} danger>
            ✕
          </IconBtn>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-700/80 space-y-3">
          <Toggle label="Show in navbar" checked={widget.enabled} onChange={onToggleEnabled} />
          {widget.type === 'clock' ? (
            <ClockConfigEditor widgetId={widget.id} config={widget.config} />
          ) : (
            <WeatherConfigEditor widgetId={widget.id} config={widget.config} />
          )}
        </div>
      )}
    </li>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-colors disabled:opacity-30 ${
        danger
          ? 'text-red-400 hover:bg-red-900/30'
          : 'text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ClockConfigEditor({
  widgetId,
  config,
}: {
  widgetId: string;
  config: ClockWidgetConfig;
}) {
  const update = useNavbarWidgetsStore((s) => s.updateClockConfig);

  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center justify-between gap-2">
        <span className="text-gray-400">Format</span>
        <select
          value={config.format}
          onChange={(e) =>
            update(widgetId, { format: e.target.value as ClockWidgetConfig['format'] })
          }
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm"
        >
          <option value="24">24-hour</option>
          <option value="12">12-hour</option>
        </select>
      </label>
      <Toggle
        label="Show seconds"
        checked={config.showSeconds}
        onChange={(v) => update(widgetId, { showSeconds: v })}
      />
      <Toggle
        label="Show date"
        checked={config.showDate}
        onChange={(v) => update(widgetId, { showDate: v })}
      />
      <label className="block">
        <span className="text-gray-400 text-xs">Timezone (IANA, or leave blank for local)</span>
        <input
          type="text"
          value={config.timezone === 'local' ? '' : config.timezone}
          onChange={(e) => {
            const v = e.target.value.trim();
            update(widgetId, { timezone: v || 'local' });
          }}
          placeholder="e.g. America/New_York"
          className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600"
        />
      </label>
    </div>
  );
}

function WeatherConfigEditor({
  widgetId,
  config,
}: {
  widgetId: string;
  config: WeatherWidgetConfig;
}) {
  const update = useNavbarWidgetsStore((s) => s.updateWeatherConfig);
  const [query, setQuery] = useState(config.locationLabel);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchLocations(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query !== config.locationLabel) void runSearch(query);
    }, 400);
    return () => window.clearTimeout(t);
  }, [query, config.locationLabel, runSearch]);

  const pick = (r: GeocodeResult) => {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    update(widgetId, {
      locationLabel: label,
      latitude: r.latitude,
      longitude: r.longitude,
    });
    setQuery(label);
    setResults([]);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update(widgetId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          locationLabel: 'My location',
        });
        setQuery('My location');
        setResults([]);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        <span className="text-gray-400 text-xs">City or place</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        />
      </label>
      {searching && <p className="text-xs text-gray-500">Searching…</p>}
      {results.length > 0 && (
        <ul className="rounded-lg border border-gray-700 overflow-hidden max-h-36 overflow-y-auto">
          {results.map((r) => {
            const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
            return (
              <li key={`${r.latitude}-${r.longitude}-${label}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700"
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={useMyLocation}
        className="text-xs text-cyan-400 hover:text-cyan-300"
      >
        Use my current location
      </button>
      <label className="flex items-center justify-between gap-2">
        <span className="text-gray-400">Units</span>
        <select
          value={config.units}
          onChange={(e) =>
            update(widgetId, {
              units: e.target.value as WeatherWidgetConfig['units'],
            })
          }
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm"
        >
          <option value="celsius">Celsius</option>
          <option value="fahrenheit">Fahrenheit</option>
        </select>
      </label>
      <p className="text-[10px] text-gray-500 font-mono">
        {config.latitude.toFixed(4)}, {config.longitude.toFixed(4)}
      </p>
    </div>
  );
}
