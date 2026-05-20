import type { RoomBlueprint } from '../RoomBlueprint';
import {
  RadioMeshIcon,
  FmTunerIcon,
  MusicJukeboxIcon,
  DatingIcon,
  ParentalIcon,
  WatchPartyIcon,
  SportsIcon,
  NewsIcon,
  MarketIcon,
  StudyIcon,
  GameIcon,
  SosIcon,
} from '../icons';

/**
 * Metadata-only blueprints. They register the type so the picker can show it
 * and so a room with this `type` resolves to a real entry (and not the chat
 * fallback). When the corresponding agent ships widgets / composers, it just
 * replaces the entry here.
 *
 * `available: false` rooms are listed but disabled in the create-room picker;
 * already-created rooms of those types still render fine, they just use the
 * generic chat shell until the widget agent lands.
 */

export const radioMeshBlueprint: RoomBlueprint = {
  type: 'radio_mesh',
  label: 'Radio Mesh',
  tagline: 'Talk over AM/FM/sub-GHz via the in-app audio modem.',
  Icon: RadioMeshIcon,
  defaultConfig: { defaultMode: 'bfsk300', encrypted: false, keyTailMs: 250 },
  accentColor: '#f59e0b',
  // Available out-of-the-box: the chat shell still works, and the R-3 agent
  // ships the actual composer/widgets on top of this entry.
  available: true,
};

export const fmTunerBlueprint: RoomBlueprint = {
  type: 'fm_tuner',
  label: 'FM Tuner',
  tagline: 'Listen together; vote what plays next.',
  Icon: FmTunerIcon,
  defaultConfig: { allowTakeTheDeck: true, voteWindowSec: 30 },
  accentColor: '#a855f7',
  available: true,
};

export const musicJukeboxBlueprint: RoomBlueprint = {
  type: 'music_jukebox',
  label: 'Music Jukebox',
  tagline: 'Queue tracks, vote-skip, vote-next.',
  Icon: MusicJukeboxIcon,
  defaultConfig: { skipThreshold: 0.5, crossfadeMs: 1500 },
  accentColor: '#ec4899',
  available: true,
};

export const datingBlueprint: RoomBlueprint = {
  type: 'dating',
  label: 'Dating',
  tagline: 'Local matches, icebreakers, mask mode.',
  Icon: DatingIcon,
  defaultConfig: { maskByDefault: true, distanceBuckets: [1, 5, 25] },
  accentColor: '#ef4444',
  available: false,
};

export const parentalBlueprint: RoomBlueprint = {
  type: 'parental',
  label: 'Parental',
  tagline: 'Family-only space with geofencing and check-ins.',
  Icon: ParentalIcon,
  defaultConfig: { checkInHourUtc: 18 },
  accentColor: '#10b981',
  available: false,
};

export const watchPartyBlueprint: RoomBlueprint = {
  type: 'watch_party',
  label: 'Watch Party',
  tagline: 'Synced video, reactions overlay, hand raise.',
  Icon: WatchPartyIcon,
  defaultConfig: {},
  accentColor: '#06b6d4',
  available: false,
};

export const sportsBlueprint: RoomBlueprint = {
  type: 'sports',
  label: 'Sport',
  tagline: 'Live GPS routes, segments, leaderboards.',
  Icon: SportsIcon,
  defaultConfig: {},
  accentColor: '#84cc16',
  available: false,
};

export const newsBlueprint: RoomBlueprint = {
  type: 'news',
  label: 'News & Debate',
  tagline: 'Aggregated stories, votes, timed-turn debate.',
  Icon: NewsIcon,
  defaultConfig: { turnSec: 60 },
  accentColor: '#6366f1',
  available: false,
};

export const marketBlueprint: RoomBlueprint = {
  type: 'market',
  label: 'Marketplace',
  tagline: 'Item listings with geo radius and QR cards.',
  Icon: MarketIcon,
  defaultConfig: {},
  accentColor: '#eab308',
  available: false,
};

export const studyBlueprint: RoomBlueprint = {
  type: 'study',
  label: 'Study Room',
  tagline: 'Pomodoro timer, shared whiteboard, focus presence.',
  Icon: StudyIcon,
  defaultConfig: { pomodoroWorkMin: 25, pomodoroBreakMin: 5 },
  accentColor: '#14b8a6',
  available: false,
};

export const gameBlueprint: RoomBlueprint = {
  type: 'game',
  label: 'Game Lobby',
  tagline: 'Lightweight multiplayer minigames.',
  Icon: GameIcon,
  defaultConfig: {},
  accentColor: '#f43f5e',
  available: false,
};

export const sosBlueprint: RoomBlueprint = {
  type: 'sos',
  label: 'SOS',
  tagline: 'Emergency broadcasts + map markers.',
  Icon: SosIcon,
  defaultConfig: {},
  accentColor: '#dc2626',
  // SOS rooms are auto-managed by the SOS subsystem, not user-creatable.
  available: false,
};
