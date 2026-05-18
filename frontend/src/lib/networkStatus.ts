export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

export interface NetworkInfo {
  online: boolean;
  effectiveType: EffectiveConnectionType;
  downlink: number | null;
  saveData: boolean;
}

interface NetworkInformation extends EventTarget {
  effectiveType?: EffectiveConnectionType;
  downlink?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: EventListener): void;
  removeEventListener(type: 'change', listener: EventListener): void;
}

function getConnection(): NetworkInformation | null {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection ?? null;
}

export function getNetworkInfo(): NetworkInfo {
  const conn = getConnection();
  return {
    online: navigator.onLine,
    effectiveType: conn?.effectiveType ?? 'unknown',
    downlink: conn?.downlink ?? null,
    saveData: conn?.saveData ?? false,
  };
}

export function watchNetworkInfo(onChange: (info: NetworkInfo) => void): () => void {
  const conn = getConnection();

  const handleChange = () => onChange(getNetworkInfo());

  window.addEventListener('online', handleChange);
  window.addEventListener('offline', handleChange);
  conn?.addEventListener('change', handleChange);

  return () => {
    window.removeEventListener('online', handleChange);
    window.removeEventListener('offline', handleChange);
    conn?.removeEventListener('change', handleChange);
  };
}
