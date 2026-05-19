import type { RoomBlueprint } from '../RoomBlueprint';
import { FmTunerIcon } from '../icons';
import { registerRoomBlueprint } from '../registry';
import { FmNowStrip } from '../widgets/FmNowStrip';
import { FmTunerPanel } from '../widgets/FmTunerPanel';

/**
 * Full FM Tuner blueprint — overrides the metadata-only placeholder shipped
 * in R-1. Registering at module load means the panel + now-strip light up
 * automatically once this module is imported from the app bootstrap.
 *
 * - `NowStrip` displays the room's current station + per-user playback.
 * - `widgets: [FmTunerPanel]` puts the vote/propose UI in the right sidebar.
 * - No custom composer — FM rooms keep the standard chat composer so members
 *   can chat in parallel to listening.
 */
export const fmTunerBlueprint: RoomBlueprint = {
  type: 'fm_tuner',
  label: 'FM Tuner',
  tagline: 'Listen together; vote what plays next.',
  Icon: FmTunerIcon,
  defaultConfig: { allowTakeTheDeck: true, voteWindowSec: 30 },
  accentColor: '#a855f7',
  available: true,
  NowStrip: FmNowStrip,
  widgets: [FmTunerPanel],
};

registerRoomBlueprint(fmTunerBlueprint);
