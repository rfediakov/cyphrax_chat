import { create } from 'zustand';
import { getNetworkInfo, watchNetworkInfo, type EffectiveConnectionType } from '../lib/networkStatus';

interface NetworkState {
  isOnline: boolean;
  effectiveType: EffectiveConnectionType;
  downlink: number | null;
  saveData: boolean;
  queueSize: number;

  setNetworkInfo: (info: Omit<NetworkState, 'queueSize' | 'setNetworkInfo' | 'setQueueSize'>) => void;
  setQueueSize: (size: number) => void;
}

export const useNetworkStore = create<NetworkState>((set) => {
  const initial = getNetworkInfo();

  return {
    isOnline: initial.online,
    effectiveType: initial.effectiveType,
    downlink: initial.downlink,
    saveData: initial.saveData,
    queueSize: 0,

    setNetworkInfo: (info) => set(info),
    setQueueSize: (queueSize) => set({ queueSize }),
  };
});

// Bootstrap the watcher once (module-level singleton, safe for SSR-free SPA)
watchNetworkInfo((info) => {
  useNetworkStore.getState().setNetworkInfo({
    isOnline: info.online,
    effectiveType: info.effectiveType,
    downlink: info.downlink,
    saveData: info.saveData,
  });
});
