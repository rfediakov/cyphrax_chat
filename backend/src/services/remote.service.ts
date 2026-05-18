import { Types } from 'mongoose';
import { User } from '../models/user.model.js';
import { RemoteAccessLog } from '../models/remoteAccessLog.model.js';

/** Returns true when guardianId is listed in target's guardianIds */
export async function isGuardianOf(guardianId: string, targetId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(targetId) || !Types.ObjectId.isValid(guardianId)) return false;
  const target = await User.findById(targetId).select('guardianIds').lean();
  if (!target) return false;
  return target.guardianIds.some((id) => id.toString() === guardianId);
}

/** Persist a denied access log entry */
export async function logDeniedRequest(
  guardianId: string,
  targetId: string,
): Promise<void> {
  await RemoteAccessLog.create({
    requesterId: new Types.ObjectId(guardianId),
    targetUserId: new Types.ObjectId(targetId),
    requestedAt: new Date(),
    consentGiven: false,
    consentDuration: null,
    sessionStartedAt: null,
    sessionEndedAt: null,
    endedBy: null,
  });
}

/** Persist an allowed access log entry; returns the log document */
export async function logAllowedRequest(params: {
  guardianId: string;
  targetId: string;
  durationMinutes: 1 | 5;
}) {
  const now = new Date();
  return RemoteAccessLog.create({
    requesterId: new Types.ObjectId(params.guardianId),
    targetUserId: new Types.ObjectId(params.targetId),
    requestedAt: now,
    consentGiven: true,
    consentDuration: params.durationMinutes,
    sessionStartedAt: now,
    sessionEndedAt: null,
    endedBy: null,
  });
}

/** Close an active access log entry */
export async function closeAccessLog(
  guardianId: string,
  targetId: string,
  endedBy: 'requester' | 'target' | 'timeout',
): Promise<void> {
  await RemoteAccessLog.findOneAndUpdate(
    {
      requesterId: new Types.ObjectId(guardianId),
      targetUserId: new Types.ObjectId(targetId),
      consentGiven: true,
      sessionEndedAt: null,
    },
    { sessionEndedAt: new Date(), endedBy },
    { sort: { requestedAt: -1 } },
  );
}
