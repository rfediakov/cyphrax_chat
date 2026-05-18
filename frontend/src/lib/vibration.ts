const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function vibrateShort(): void {
  if (supported) navigator.vibrate(50);
}

export function vibrateMedium(): void {
  if (supported) navigator.vibrate(150);
}

export function vibrateLong(): void {
  if (supported) navigator.vibrate(300);
}

export function vibratePattern(pattern: number[]): void {
  if (supported) navigator.vibrate(pattern);
}

/** SOS morse code: · · · — — — · · · */
export function vibrateSOS(): void {
  if (supported)
    navigator.vibrate([200, 100, 200, 100, 200, 300, 500, 100, 500, 100, 500, 300, 200, 100, 200, 100, 200]);
}

/** Notification-style double pulse */
export function vibrateNotification(): void {
  if (supported) navigator.vibrate([100, 50, 100]);
}

/** Call ringing pattern */
export function vibrateRinging(): void {
  if (supported) navigator.vibrate([500, 300, 500, 300, 500, 300, 500]);
}

export function stopVibration(): void {
  if (supported) navigator.vibrate(0);
}

export function isVibrationSupported(): boolean {
  return supported;
}
