/**
 * Marker categories shared between the map UI, legend, popup and add-sheet.
 * Keep `MARKER_KINDS` in sync with the backend's `MAP_MARKER_KINDS`.
 */

export const MARKER_KINDS = [
  'pin',
  'meet',
  'hazard',
  'food',
  'camp',
  'photo',
] as const;

export type MarkerKind = (typeof MARKER_KINDS)[number];

export interface MarkerKindConfig {
  kind: MarkerKind;
  label: string;
  emoji: string;
  color: string;
  /** Short helper sentence shown in the picker. */
  hint: string;
}

export const MARKER_KIND_CONFIG: Record<MarkerKind, MarkerKindConfig> = {
  pin: {
    kind: 'pin',
    label: 'Pin',
    emoji: '📍',
    color: '#3b82f6',
    hint: 'A general point of interest',
  },
  meet: {
    kind: 'meet',
    label: 'Meet here',
    emoji: '🚩',
    color: '#22c55e',
    hint: 'Rendezvous spot for the group',
  },
  hazard: {
    kind: 'hazard',
    label: 'Hazard',
    emoji: '⚠️',
    color: '#ef4444',
    hint: 'Danger or area to avoid',
  },
  food: {
    kind: 'food',
    label: 'Food',
    emoji: '🍴',
    color: '#f59e0b',
    hint: 'Restaurant, café or supply stop',
  },
  camp: {
    kind: 'camp',
    label: 'Camp',
    emoji: '⛺',
    color: '#a16207',
    hint: 'Campsite or rest stop',
  },
  photo: {
    kind: 'photo',
    label: 'Photo',
    emoji: '📷',
    color: '#a855f7',
    hint: 'Worth-a-shot view or memory',
  },
};

export function getMarkerKindConfig(kind: MarkerKind | string): MarkerKindConfig {
  return MARKER_KIND_CONFIG[kind as MarkerKind] ?? MARKER_KIND_CONFIG.pin;
}
