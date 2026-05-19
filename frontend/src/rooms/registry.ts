import type { RoomBlueprint, RoomType } from './RoomBlueprint';
import { chatBlueprint } from './blueprints/chatBlueprint';
import {
  radioMeshBlueprint,
  fmTunerBlueprint,
  musicJukeboxBlueprint,
  datingBlueprint,
  parentalBlueprint,
  watchPartyBlueprint,
  sportsBlueprint,
  newsBlueprint,
  marketBlueprint,
  studyBlueprint,
  gameBlueprint,
  sosBlueprint,
} from './blueprints/placeholderBlueprints';

/**
 * Central registry mapping every supported `RoomType` to a `RoomBlueprint`.
 *
 * - `getRoomBlueprint(type)` always returns *something* (falls back to the
 *   `chat` blueprint when the type is missing or unknown). This is what the
 *   Chat shell uses to render any room — old or new.
 * - `listAvailableBlueprints()` returns only the entries that should appear
 *   as a *creatable* option in the Create-Room modal.
 */

const REGISTRY: Record<RoomType, RoomBlueprint> = {
  chat: chatBlueprint,
  radio_mesh: radioMeshBlueprint,
  fm_tuner: fmTunerBlueprint,
  music_jukebox: musicJukeboxBlueprint,
  dating: datingBlueprint,
  parental: parentalBlueprint,
  watch_party: watchPartyBlueprint,
  sports: sportsBlueprint,
  news: newsBlueprint,
  market: marketBlueprint,
  study: studyBlueprint,
  game: gameBlueprint,
  sos: sosBlueprint,
};

/** Return the blueprint for the given type, or the chat fallback if unknown. */
export function getRoomBlueprint(type: string | undefined | null): RoomBlueprint {
  if (!type) return chatBlueprint;
  const entry = REGISTRY[type as RoomType];
  return entry ?? chatBlueprint;
}

/** Every registered blueprint, in declaration order, including unavailable ones. */
export function listAllBlueprints(): RoomBlueprint[] {
  return Object.values(REGISTRY);
}

/** Only blueprints that should be offered as a "creatable" type in the picker. */
export function listAvailableBlueprints(): RoomBlueprint[] {
  return listAllBlueprints().filter((b) => b.available);
}

/**
 * Register / override a blueprint at runtime (used by per-room agents that
 * ship a richer implementation than the bundled placeholder).
 */
export function registerRoomBlueprint(blueprint: RoomBlueprint): void {
  REGISTRY[blueprint.type] = blueprint;
}
