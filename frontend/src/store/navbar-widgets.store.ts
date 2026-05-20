import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClockWidgetConfig,
  NavbarWidget,
  NavbarWidgetType,
  WeatherWidgetConfig,
} from '../types/navbar-widgets';
import {
  DEFAULT_CLOCK_CONFIG,
  DEFAULT_WEATHER_CONFIG,
} from '../types/navbar-widgets';

function newId(): string {
  return crypto.randomUUID();
}

function defaultWidget(type: NavbarWidgetType): NavbarWidget {
  const id = newId();
  if (type === 'clock') {
    return { id, type: 'clock', enabled: true, config: { ...DEFAULT_CLOCK_CONFIG } };
  }
  return { id, type: 'weather', enabled: true, config: { ...DEFAULT_WEATHER_CONFIG } };
}

interface NavbarWidgetsState {
  widgets: NavbarWidget[];
  addWidget: (type: NavbarWidgetType) => string;
  removeWidget: (id: string) => void;
  setWidgetEnabled: (id: string, enabled: boolean) => void;
  updateClockConfig: (id: string, config: Partial<ClockWidgetConfig>) => void;
  updateWeatherConfig: (id: string, config: Partial<WeatherWidgetConfig>) => void;
  moveWidget: (id: string, direction: 'up' | 'down') => void;
}

export const useNavbarWidgetsStore = create<NavbarWidgetsState>()(
  persist(
    (set) => ({
      widgets: [],

      addWidget: (type) => {
        const widget = defaultWidget(type);
        set((s) => ({ widgets: [...s.widgets, widget] }));
        return widget.id;
      },

      removeWidget: (id) =>
        set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),

      setWidgetEnabled: (id, enabled) =>
        set((s) => ({
          widgets: s.widgets.map((w) => (w.id === id ? { ...w, enabled } : w)),
        })),

      updateClockConfig: (id, config) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === id && w.type === 'clock'
              ? { ...w, config: { ...w.config, ...config } }
              : w,
          ),
        })),

      updateWeatherConfig: (id, config) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === id && w.type === 'weather'
              ? { ...w, config: { ...w.config, ...config } }
              : w,
          ),
        })),

      moveWidget: (id, direction) =>
        set((s) => {
          const idx = s.widgets.findIndex((w) => w.id === id);
          if (idx < 0) return s;
          const next = [...s.widgets];
          const swap = direction === 'up' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= next.length) return s;
          [next[idx], next[swap]] = [next[swap], next[idx]];
          return { widgets: next };
        }),
    }),
    { name: 'navbar-widgets' },
  ),
);

export function selectEnabledWidgets(widgets: NavbarWidget[]): NavbarWidget[] {
  return widgets.filter((w) => w.enabled);
}
