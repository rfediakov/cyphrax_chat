import { isRoomType, ROOM_TYPES } from '../models/room.model.js';

describe('Room type enum', () => {
  it('contains the canonical SafeGroup room types', () => {
    expect(ROOM_TYPES).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('isRoomType returns true for known values', () => {
    for (const t of ROOM_TYPES) {
      expect(isRoomType(t)).toBe(true);
    }
  });

  it('isRoomType rejects unknown / non-string values', () => {
    expect(isRoomType('definitely_not_a_type')).toBe(false);
    expect(isRoomType('')).toBe(false);
    expect(isRoomType(undefined)).toBe(false);
    expect(isRoomType(42)).toBe(false);
    expect(isRoomType(null)).toBe(false);
  });
});
