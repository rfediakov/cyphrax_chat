import { create } from 'zustand';
import type { PrivacySettings } from '../api/privacy.api';

interface SettingsState {
  settings: PrivacySettings | null;
  loading: boolean;
  setSettings: (s: PrivacySettings) => void;
  patchSettings: (patch: Partial<PrivacySettings>) => void;
  setLoading: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  setSettings: (settings) => set({ settings }),
  patchSettings: (patch) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...patch } : null,
    })),
  setLoading: (loading) => set({ loading }),
}));
