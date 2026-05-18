import { create } from 'zustand';
import type { LiveTelemetryEntry } from '../api/telemetry.api';

interface TelemetryState {
  /** Map of userId → latest telemetry snapshot */
  entries: Record<string, LiveTelemetryEntry>;
  upsert: (entry: LiveTelemetryEntry) => void;
  bulkSet: (entries: LiveTelemetryEntry[]) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  entries: {},
  upsert: (entry) =>
    set((state) => ({
      entries: { ...state.entries, [entry.userId]: entry },
    })),
  bulkSet: (entries) =>
    set((state) => {
      const next = { ...state.entries };
      for (const e of entries) {
        next[e.userId] = e;
      }
      return { entries: next };
    }),
}));
