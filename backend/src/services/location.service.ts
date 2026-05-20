import { Types } from 'mongoose';
import { User } from '../models/user.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';
import { redis } from '../lib/redis.js';
import { canViewField } from '../middleware/privacy.js';

export interface CachedLocation {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  updatedAt: number;
}

export interface LiveLocationPayload extends CachedLocation {
  username: string;
}

/** Accepted friend user ids for the requester (symmetric). */
export async function getFriendIds(userId: string): Promise<Set<string>> {
  const userObjectId = new Types.ObjectId(userId);
  const requests = await FriendRequest.find({
    $or: [{ fromUser: userObjectId }, { toUser: userObjectId }],
    status: 'accepted',
  }).lean();

  const ids = new Set<string>();
  for (const r of requests) {
    const other =
      r.fromUser.toString() === userId ? r.toUser.toString() : r.fromUser.toString();
    ids.add(other);
  }
  return ids;
}

function targetContactIdsForRequester(
  requesterId: string,
  targetId: string,
  friendIds: Set<string>,
): string[] {
  return friendIds.has(targetId) ? [requesterId] : [];
}

export async function getGlobalLiveLocations(
  requesterId: string,
): Promise<LiveLocationPayload[]> {
  const friendIds = await getFriendIds(requesterId);

  const users = await User.find({
    deletedAt: null,
    isGuest: { $ne: true },
    _id: { $ne: new Types.ObjectId(requesterId) },
  })
    .select(
      '_id username privacyLocation locationSharingActive guardianIds emergencyContacts',
    )
    .lean();

  const locations: LiveLocationPayload[] = [];

  for (const user of users) {
    if (!user.locationSharingActive) continue;

    const uid = user._id.toString();
    const contactIds = targetContactIdsForRequester(requesterId, uid, friendIds);
    if (!canViewField(requesterId, user, 'privacyLocation', contactIds)) continue;

    const cached = await redis.get(`loc:${uid}`);
    if (!cached) continue;

    const parsed = JSON.parse(cached) as CachedLocation;
    locations.push({ ...parsed, username: user.username });
  }

  return locations;
}

export async function buildLivePayloadForUser(
  userId: string,
): Promise<LiveLocationPayload | null> {
  const user = await User.findById(userId)
    .select('username locationSharingActive')
    .lean();
  if (!user?.locationSharingActive) return null;

  const cached = await redis.get(`loc:${userId}`);
  if (!cached) return null;

  const parsed = JSON.parse(cached) as CachedLocation;
  return { ...parsed, username: user.username };
}
