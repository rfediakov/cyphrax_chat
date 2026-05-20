import type { RoomBlueprint } from '../RoomBlueprint';
import { ChatIcon } from '../icons';

/**
 * The legacy "general chat" room — composer, message list, members, map.
 *
 * This blueprint is intentionally empty: it owns *no* widgets and *no*
 * composer override, so the existing Chat shell renders exactly as it did
 * before R-1. The blueprint exists so the registry can return *something* for
 * every room (and so unknown types fall back to this one).
 */
export const chatBlueprint: RoomBlueprint = {
  type: 'chat',
  label: 'Chat',
  tagline: 'Plain text + voice notes, maps, calls, SOS.',
  Icon: ChatIcon,
  defaultConfig: {},
  accentColor: '#3b82f6',
  available: true,
};
