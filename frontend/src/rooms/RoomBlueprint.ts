import type { FC } from 'react';

/**
 * Canonical SafeGroup room types.
 *
 * Keep this list in sync with `backend/src/models/room.model.ts → ROOM_TYPES`.
 * The frontend tolerates *unknown* values gracefully — the registry falls back
 * to the `chat` blueprint when a room sends a type we don't recognise (e.g. a
 * newer backend talking to an older client).
 */
export const ROOM_TYPES = [
  'chat',
  'radio_mesh',
  'fm_tuner',
  'music_jukebox',
  'dating',
  'parental',
  'watch_party',
  'sports',
  'news',
  'market',
  'study',
  'game',
  'sos',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export function isRoomType(value: unknown): value is RoomType {
  return typeof value === 'string' && (ROOM_TYPES as readonly string[]).includes(value);
}

/** Props every widget / composer / settings component gets. */
export interface RoomComponentProps {
  roomId: string;
  config?: Record<string, unknown>;
}

export interface RoomBlueprint<C = Record<string, unknown>> {
  type: RoomType;
  /** Human-readable name used in the type picker. */
  label: string;
  /** One-line description shown beside the type in the create-room modal. */
  tagline: string;
  /** Small monochrome icon (24×24 viewBox), rendered inline. */
  Icon: FC<{ className?: string }>;
  /**
   * Top-of-room "now strip" — a thin status bar above the message list.
   * Optional; chat rooms hide it on mobile by default.
   */
  NowStrip?: FC<RoomComponentProps>;
  /**
   * Right-side panel widget(s) for this room. Rendered inside the existing
   * right sidebar. Each blueprint can ship 0..N widgets.
   */
  widgets?: Array<FC<RoomComponentProps>>;
  /** Replaces `MessageInput`. If `undefined`, the default chat composer is used. */
  Composer?: FC<RoomComponentProps>;
  /** Optional admin settings panel surfaced from `ManageRoomModal`. */
  Settings?: FC<RoomComponentProps>;
  /** Default `config` JSON when a room of this type is freshly created. */
  defaultConfig: C;
  /**
   * Accent color used by the type badge and the now-strip border. Tailwind-
   * compatible hex; the registry pre-computes class strings.
   */
  accentColor: string;
  /** True when the type is implemented enough to be selectable on creation. */
  available: boolean;
}
