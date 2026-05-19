import type { RoomBlueprint } from '../RoomBlueprint';
import { MusicJukeboxIcon } from '../icons';
import { registerRoomBlueprint } from '../registry';
import { JukeboxNowStrip } from '../widgets/JukeboxNowStrip';
import { JukeboxPanel } from '../widgets/JukeboxPanel';

/**
 * Full Music Jukebox blueprint — overrides the metadata-only placeholder
 * shipped in R-1. Registering at module load means the panel + now-strip light
 * up automatically once this module is imported from the app bootstrap.
 *
 *  - `NowStrip` displays the playing track + skip-vote ratio + hidden audio.
 *  - `widgets: [JukeboxPanel]` mounts the queue / add-track UI in the right
 *    sidebar (same convention as the FM Tuner widget).
 *  - No custom composer — jukebox rooms keep the standard chat composer so
 *    members can chat while listening together.
 */
export const musicJukeboxBlueprint: RoomBlueprint = {
  type: 'music_jukebox',
  label: 'Music Jukebox',
  tagline: 'Queue tracks, vote-skip, vote-next.',
  Icon: MusicJukeboxIcon,
  defaultConfig: { skipThreshold: 0.5, crossfadeMs: 1500 },
  accentColor: '#ec4899',
  available: true,
  NowStrip: JukeboxNowStrip,
  widgets: [JukeboxPanel],
};

registerRoomBlueprint(musicJukeboxBlueprint);
