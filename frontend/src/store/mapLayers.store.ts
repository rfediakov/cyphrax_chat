import { create } from 'zustand';
import { MARKER_KINDS, type MarkerKind } from '../lib/markerKinds';

/**
 * Logical map "layers" the user can toggle from the legend. Layers cover
 * built-in entities (the caller themselves, peer locations, SOS) as well
 * as one entry per custom marker category.
 */
export type MapLayerId = 'self' | 'peers' | 'sos' | `marker:${MarkerKind}`;

export const ALL_LAYER_IDS: MapLayerId[] = [
  'self',
  'peers',
  'sos',
  ...MARKER_KINDS.map((k) => `marker:${k}` as MapLayerId),
];

const STORAGE_KEY = 'map:hidden-layers';

function readHiddenFromStorage(): Set<MapLayerId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is MapLayerId => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeHiddenToStorage(hidden: Set<MapLayerId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    // Quota / private mode — ignore
  }
}

interface MapLayersState {
  /** Layers that are explicitly hidden. Anything not listed here is visible. */
  hidden: Set<MapLayerId>;
  isVisible: (layer: MapLayerId) => boolean;
  toggle: (layer: MapLayerId) => void;
  setVisible: (layer: MapLayerId, visible: boolean) => void;
  showAll: () => void;
  hideAll: () => void;
}

export const useMapLayersStore = create<MapLayersState>((set, get) => ({
  hidden: readHiddenFromStorage(),

  isVisible: (layer) => !get().hidden.has(layer),

  toggle: (layer) =>
    set((s) => {
      const next = new Set(s.hidden);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      writeHiddenToStorage(next);
      return { hidden: next };
    }),

  setVisible: (layer, visible) =>
    set((s) => {
      const next = new Set(s.hidden);
      if (visible) next.delete(layer);
      else next.add(layer);
      writeHiddenToStorage(next);
      return { hidden: next };
    }),

  showAll: () =>
    set(() => {
      writeHiddenToStorage(new Set());
      return { hidden: new Set() };
    }),

  hideAll: () =>
    set(() => {
      const next = new Set<MapLayerId>(ALL_LAYER_IDS);
      writeHiddenToStorage(next);
      return { hidden: next };
    }),
}));
