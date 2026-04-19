import { Types } from 'mongoose';
import { FriendRequest } from '../models/friendRequest.model.js';
import { UserBan } from '../models/userBan.model.js';
import { User } from '../models/user.model.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';

function toPublic<T extends { _id: unknown }>(doc: T) {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export async function getFriends(userId: string) {
  const userObjectId = new Types.ObjectId(userId);

  const requests = await FriendRequest.find({
    $or: [{ fromUser: userObjectId }, { toUser: userObjectId }],
    status: 'accepted',
  }).lean();

  const friendIds = requests.map((r) =>
    r.fromUser.toString() === userId ? r.toUser : r.fromUser,
  );

  const friends = await User.find({ _id: { $in: friendIds }, deletedAt: null })
    .select('_id username email')
    .lean();

  return friends.map(toPublic);
}

export async function sendFriendRequest(
  fromUserId: string,
  toUsername: string,
  message?: string,
): Promise<{ toUserId: string }> {
  const fromObjectId = new Types.ObjectId(fromUserId);

  const toUser = await User.findOne({ username: toUsername, deletedAt: null }).lean();
  if (!toUser) {
    throw new NotFoundError('User not found');
  }

  const toObjectId = toUser._id as Types.ObjectId;

  if (toObjectId.toString() === fromUserId) {
    throw new BadRequestError('Cannot send a friend request to yourself');
  }

  // Block if either side has banned the other
  const ban = await UserBan.findOne({
    $or: [
      { blockerId: fromObjectId, blockedId: toObjectId },
      { blockerId: toObjectId, blockedId: fromObjectId },
    ],
  }).lean();

  if (ban) {
    throw new ForbiddenError('Cannot send friend request to this user');
  }

  const existing = await FriendRequest.findOne({
    $or: [
      { fromUser: fromObjectId, toUser: toObjectId },
      { fromUser: toObjectId, toUser: fromObjectId },
    ],
  });

  if (existing) {
    if (existing.status === 'accepted') {
      throw new ConflictError('Already friends');
    }
    if (existing.status === 'pending') {
      throw new ConflictError('Friend request already pending');
    }
    // Re-send previously rejected request
    existing.fromUser = fromObjectId;
    existing.toUser = toObjectId;
    existing.message = message ?? '';
    existing.status = 'pending';
    await existing.save();
    return { toUserId: toObjectId.toString() };
  }

  await FriendRequest.create({
    fromUser: fromObjectId,
    toUser: toObjectId,
    message: message ?? '',
  });

  return { toUserId: toObjectId.toString() };
}

export async function getPendingRequests(userId: string) {
  const userObjectId = new Types.ObjectId(userId);

  const requests = await FriendRequest.find({ toUser: userObjectId, status: 'pending' })
    .populate<{ fromUser: { _id: Types.ObjectId; username: string; email: string } }>(
      'fromUser',
      '_id username email',
    )
    .lean();

  return requests.map((r) => ({
    id: String(r._id),
    fromUser: { id: String(r.fromUser._id), username: r.fromUser.username, email: r.fromUser.email },
    message: r.message,
    createdAt: r.createdAt,
  }));
}

export async function respondToFriendRequest(
  userId: string,
  requestId: string,
  action: 'accept' | 'reject',
): Promise<void> {
  const request = await FriendRequest.findOne({
    _id: requestId,
    toUser: new Types.ObjectId(userId),
    status: 'pending',
  });

  if (!request) {
    throw new NotFoundError('Friend request not found');
  }

  request.status = action === 'accept' ? 'accepted' : 'rejected';
  await request.save();
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const userObjectId = new Types.ObjectId(userId);
  const friendObjectId = new Types.ObjectId(friendId);

  const result = await FriendRequest.findOneAndUpdate(
    {
      $or: [
        { fromUser: userObjectId, toUser: friendObjectId },
        { fromUser: friendObjectId, toUser: userObjectId },
      ],
      status: 'accepted',
    },
    { status: 'rejected' },
  );

  if (!result) {
    throw new NotFoundError('Friend not found');
  }
}

export async function banUser(blockerId: string, targetId: string): Promise<void> {
  if (blockerId === targetId) {
    throw new BadRequestError('Cannot ban yourself');
  }

  const blockerObjectId = new Types.ObjectId(blockerId);
  const targetObjectId = new Types.ObjectId(targetId);

  const target = await User.findOne({ _id: targetObjectId, deletedAt: null }).lean();
  if (!target) {
    throw new NotFoundError('User not found');
  }

  // §12.3 cascade: delete accepted FriendRequest documents
  await FriendRequest.deleteMany({
    $or: [
      { fromUser: blockerObjectId, toUser: targetObjectId },
      { fromUser: targetObjectId, toUser: blockerObjectId },
    ],
  });

  // Upsert ban record
  await UserBan.updateOne(
    { blockerId: blockerObjectId, blockedId: targetObjectId },
    { blockerId: blockerObjectId, blockedId: targetObjectId },
    { upsert: true },
  );
}

export async function unbanUser(blockerId: string, targetId: string): Promise<void> {
  const result = await UserBan.findOneAndDelete({
    blockerId: new Types.ObjectId(blockerId),
    blockedId: new Types.ObjectId(targetId),
  });

  if (!result) {
    throw new NotFoundError('Ban not found');
  }
}
