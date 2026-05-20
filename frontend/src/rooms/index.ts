/**
 * Rooms module entry point.
 *
 * Side effects: registers any real blueprint overrides at module load. Place
 * this import in `main.tsx` so the registry is populated before the Chat
 * shell runs `getRoomBlueprint(...)`.
 */

import { registerRoomBlueprint } from './registry';
import { realRadioMeshBlueprint } from './blueprints/radioMeshBlueprint';

registerRoomBlueprint(realRadioMeshBlueprint);

export {};
