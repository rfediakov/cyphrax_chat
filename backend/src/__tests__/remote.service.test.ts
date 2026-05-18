import { Types } from 'mongoose';

// ── Mock Mongoose models ────────────────────────────────────────────────────────
const mockUserFindById = jest.fn();
const mockRemoteAccessLogCreate = jest.fn();
const mockRemoteAccessLogFindOneAndUpdate = jest.fn();

jest.mock('../models/user.model.js', () => ({
  User: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

jest.mock('../models/remoteAccessLog.model.js', () => ({
  RemoteAccessLog: {
    create: (...args: unknown[]) => mockRemoteAccessLogCreate(...args),
    findOneAndUpdate: (...args: unknown[]) => mockRemoteAccessLogFindOneAndUpdate(...args),
  },
}));

// Delay import until after mocks are in place
let isGuardianOf: typeof import('../services/remote.service.js').isGuardianOf;
let logDeniedRequest: typeof import('../services/remote.service.js').logDeniedRequest;
let logAllowedRequest: typeof import('../services/remote.service.js').logAllowedRequest;
let closeAccessLog: typeof import('../services/remote.service.js').closeAccessLog;

beforeAll(async () => {
  const mod = await import('../services/remote.service.js');
  isGuardianOf = mod.isGuardianOf;
  logDeniedRequest = mod.logDeniedRequest;
  logAllowedRequest = mod.logAllowedRequest;
  closeAccessLog = mod.closeAccessLog;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── isGuardianOf ───────────────────────────────────────────────────────────────

describe('isGuardianOf', () => {
  const guardianId = new Types.ObjectId().toString();
  const targetId = new Types.ObjectId().toString();

  it('returns true when guardianId is in target.guardianIds', async () => {
    mockUserFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          guardianIds: [new Types.ObjectId(guardianId)],
        }),
      }),
    });

    const result = await isGuardianOf(guardianId, targetId);
    expect(result).toBe(true);
  });

  it('returns false when guardianId is NOT in target.guardianIds', async () => {
    mockUserFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          guardianIds: [new Types.ObjectId()],
        }),
      }),
    });

    const result = await isGuardianOf(guardianId, targetId);
    expect(result).toBe(false);
  });

  it('returns false when target user is not found', async () => {
    mockUserFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const result = await isGuardianOf(guardianId, targetId);
    expect(result).toBe(false);
  });

  it('returns false when targetId is not a valid ObjectId', async () => {
    const result = await isGuardianOf(guardianId, 'invalid-id');
    expect(result).toBe(false);
    expect(mockUserFindById).not.toHaveBeenCalled();
  });
});

// ── logDeniedRequest ───────────────────────────────────────────────────────────

describe('logDeniedRequest', () => {
  it('creates a RemoteAccessLog entry with consentGiven: false', async () => {
    const guardianId = new Types.ObjectId().toString();
    const targetId = new Types.ObjectId().toString();

    mockRemoteAccessLogCreate.mockResolvedValue({});

    await logDeniedRequest(guardianId, targetId);

    expect(mockRemoteAccessLogCreate).toHaveBeenCalledTimes(1);
    const payload = mockRemoteAccessLogCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.consentGiven).toBe(false);
    expect(payload.consentDuration).toBeNull();
    expect(payload.sessionStartedAt).toBeNull();
  });
});

// ── logAllowedRequest ──────────────────────────────────────────────────────────

describe('logAllowedRequest', () => {
  it('creates a RemoteAccessLog entry with consentGiven: true and correct duration', async () => {
    const guardianId = new Types.ObjectId().toString();
    const targetId = new Types.ObjectId().toString();
    const mockLog = { _id: new Types.ObjectId() };

    mockRemoteAccessLogCreate.mockResolvedValue(mockLog);

    const result = await logAllowedRequest({ guardianId, targetId, durationMinutes: 5 });

    expect(result).toBe(mockLog);
    const payload = mockRemoteAccessLogCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.consentGiven).toBe(true);
    expect(payload.consentDuration).toBe(5);
    expect(payload.sessionStartedAt).toBeInstanceOf(Date);
    expect(payload.sessionEndedAt).toBeNull();
  });
});

// ── closeAccessLog ─────────────────────────────────────────────────────────────

describe('closeAccessLog', () => {
  it('updates the most recent open log entry with sessionEndedAt and endedBy', async () => {
    const guardianId = new Types.ObjectId().toString();
    const targetId = new Types.ObjectId().toString();

    mockRemoteAccessLogFindOneAndUpdate.mockResolvedValue({});

    await closeAccessLog(guardianId, targetId, 'target');

    expect(mockRemoteAccessLogFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const update = mockRemoteAccessLogFindOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(update.endedBy).toBe('target');
    expect(update.sessionEndedAt).toBeInstanceOf(Date);
  });

  it('handles all valid endedBy values', async () => {
    const guardianId = new Types.ObjectId().toString();
    const targetId = new Types.ObjectId().toString();

    mockRemoteAccessLogFindOneAndUpdate.mockResolvedValue({});

    for (const endedBy of ['requester', 'target', 'timeout'] as const) {
      await closeAccessLog(guardianId, targetId, endedBy);
    }

    expect(mockRemoteAccessLogFindOneAndUpdate).toHaveBeenCalledTimes(3);
    const endedByValues = mockRemoteAccessLogFindOneAndUpdate.mock.calls.map(
      (call) => (call[1] as Record<string, unknown>)['endedBy'],
    );
    expect(endedByValues).toEqual(['requester', 'target', 'timeout']);
  });
});
