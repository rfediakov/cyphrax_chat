/**
 * Battery Status API wrapper.
 *
 * NOTE: navigator.getBattery() was deprecated in Chrome on HTTPS origins for
 * privacy reasons (since 2019). It remains functional in Firefox and some
 * Chromium-based browsers. For guaranteed battery data on Android, wrap the
 * app as a TWA (Trusted Web Activity) which can expose native battery info.
 * In all other cases we return `null` gracefully.
 */

export interface BatteryInfo {
  level: number;         // 0.0 – 1.0
  charging: boolean;
  chargingTime: number;  // seconds until full, or Infinity
  dischargingTime: number;
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  addEventListener(type: 'levelchange' | 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange', listener: EventListener): void;
  removeEventListener(type: 'levelchange' | 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange', listener: EventListener): void;
}

function hasBatteryApi(): boolean {
  return typeof navigator !== 'undefined' && 'getBattery' in navigator;
}

async function getRawBattery(): Promise<BatteryManager | null> {
  if (!hasBatteryApi()) return null;
  try {
    return await (navigator as Navigator & { getBattery(): Promise<BatteryManager> }).getBattery();
  } catch {
    return null;
  }
}

function fromManager(b: BatteryManager): BatteryInfo {
  return {
    level: b.level,
    charging: b.charging,
    chargingTime: b.chargingTime,
    dischargingTime: b.dischargingTime,
  };
}

export async function getBattery(): Promise<BatteryInfo | null> {
  const battery = await getRawBattery();
  return battery ? fromManager(battery) : null;
}

export function watchBattery(onChange: (info: BatteryInfo) => void): () => void {
  let battery: BatteryManager | null = null;

  const EVENTS = ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'] as const;

  function handleChange() {
    if (battery) onChange(fromManager(battery));
  }

  getRawBattery().then((b) => {
    if (!b) return;
    battery = b;
    EVENTS.forEach((ev) => b.addEventListener(ev, handleChange));
    onChange(fromManager(b));
  });

  return () => {
    if (!battery) return;
    EVENTS.forEach((ev) => battery!.removeEventListener(ev, handleChange));
  };
}
