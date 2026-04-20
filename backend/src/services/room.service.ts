import fs from 'fs/promises';
import { Types } from 'mongoose';
import { Room } from '../models/room.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { RoomBan } from '../models/roomBan.model.js';
import { RoomInvitation } from '../models/roomInvitation.model.js';
import { Message } from '../models/message.model.js';
import { Attachment } from '../models/attachment.model.js';
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

/** Delete all messages, attachments (+ files from disk) for a given roomId. */
async function cascadeDeleteRoomMessages(roomId: Types.ObjectId): Promise<void> {
  const messages = await Message.find({ roomId }).lean();
  const messageIds = messages.map((m) => m._id as Types.ObjectId);

  if (messageIds.length > 0) {
    const attachments = await Attachment.find({ messageId: { $in: messageIds } }).lean();

    // Delete files from disk (best-effort)
    for (const att of attachments) {
      await fs.unlink(att.storedPath).catch(() => undefined);
    }

    await Attachment.deleteMany({ messageId: { $in: messageIds } });
    await Message.deleteMany({ roomId });
  }
}

// §12.2 Room deletion cascade
export async function deleteRoomCascade(roomId: Types.ObjectId): Promise<void> {
  await cascadeDeleteRoomMessages(roomId);
  await RoomMember.deleteMany({ roomId });
  await RoomBan.deleteMany({ roomId });
  await RoomInvitation.deleteMany({ roomId });
  await Room.findByIdAndDelete(roomId);
}

// GET /api/v1/rooms/mine — all rooms the authenticated user is a member of
export async function getMyRooms(userId: string): Promise<{ rooms: ReturnType<typeof toPublic>[] }> {
  const memberships = await RoomMember.find({ userId: new Types.ObjectId(userId) }).lean();
  const roomIds = memberships.map((m) => m.roomId);
  const rooms = await Room.find({ _id: { $in: roomIds } }).sort({ createdAt: -1 }).lean();
  return { rooms: rooms.map(toPublic) };
}

// GET /api/v1/rooms/public?q=&page=
export async function getPublicRooms(
  q: string,
  page: number,
  pageSize = 20,
): Promise<{ rooms: ReturnType<typeof toPublic>[]; total: number }> {
  const skip = (page - 1) * pageSize;
  const filter: Record<string, unknown> = { visibility: 'public' };

  if (q) {
    filter.$text = { $search: q };
  }

  const [rooms, total] = await Promise.all([
    Room.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Room.countDocuments(filter),
  ]);

  return { rooms: rooms.map(toPublic), total };
}

// POST /api/v1/rooms
export async function createRoom(
  ownerId: string,
  data: { name: string; description?: string; visibility?: 'public' | 'private' },
) {
  const ownerObjectId = new Types.ObjectId(ownerId);
  const { name, description = '', visibility = 'public' } = data;

  const existing = await Room.findOne({ name }).lean();
  if (existing) {
    throw new ConflictError('Room name already taken');
  }

  const room = await Room.create({ name, description, visibility, ownerId: ownerObjectId });

  // Creator becomes a member with implicit 'member' role (owner is tracked via room.ownerId)
  await RoomMember.create({ roomId: room._id, userId: ownerObjectId, role: 'member' });

  return toPublic(room.toObject());
}

// GET /api/v1/rooms/:id
export async function getRoom(roomId: string) {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }
  return toPublic(room);
}

// PUT /api/v1/rooms/:id
export async function updateRoom(
  roomId: string,
  userId: string,
  data: { name?: string; description?: string; visibility?: 'public' | 'private' },
) {
  const room = await Room.findById(roomId);
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (room.ownerId.toString() !== userId) {
    throw new ForbiddenError('Only the owner can update room settings');
  }

  if (data.name && data.name !== room.name) {
    const conflict = await Room.findOne({ name: data.name, _id: { $ne: room._id } }).lean();
    if (conflict) {
      throw new ConflictError('Room name already taken');
    }
    room.name = data.name;
  }

  if (data.description !== undefined) room.description = data.description;
  if (data.visibility !== undefined) room.visibility = data.visibility;

  await room.save();
  return toPublic(room.toObject());
}

// DELETE /api/v1/rooms/:id
export async function deleteRoom(roomId: string, userId: string): Promise<void> {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (room.ownerId.toString() !== userId) {
    throw new ForbiddenError('Only the owner can delete the room');
  }

  await deleteRoomCascade(room._id as Types.ObjectId);
}

// POST /api/v1/rooms/:id/join
export async function joinRoom(roomId: string, userId: string): Promise<void> {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (room.visibility !== 'public') {
    throw new ForbiddenError('This room requires an invitation');
  }

  const roomObjectId = room._id as Types.ObjectId;
  const userObjectId = new Types.ObjectId(userId);

  const ban = await RoomBan.findOne({ roomId: roomObjectId, userId: userObjectId }).lean();
  if (ban) {
    throw new ForbiddenError('You are banned from this room');
  }

  await RoomMember.updateOne(
    { roomId: roomObjectId, userId: userObjectId },
    { roomId: roomObjectId, userId: userObjectId, role: 'member', joinedAt: new Date() },
    { upsert: true },
  );
}

// DELETE /api/v1/rooms/:id/leave
export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // §12.4 Owner cannot leave
  if (room.ownerId.toString() === userId) {
    throw new BadRequestError('Room owner cannot leave; transfer ownership or delete the room');
  }

  const result = await RoomMember.findOneAndDelete({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(userId),
  });

  if (!result) {
    throw new NotFoundError('You are not a member of this room');
  }
}

// GET /api/v1/rooms/:id/members
export async function getMembers(roomId: string, requesterId: string) {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  const member = await RoomMember.findOne({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(requesterId),
  }).lean();

  if (!member) {
    throw new ForbiddenError('You are not a member of this room');
  }

  const members = await RoomMember.find({ roomId: new Types.ObjectId(roomId) })
    .populate<{ userId: { _id: Types.ObjectId; username: string; email: string } }>(
      'userId',
      '_id username email',
    )
    .lean();

  const ownerId = room.ownerId.toString();

  return members.map((m) => ({
    id: String(m._id),
    user: { id: String(m.userId._id), username: m.userId.username, email: m.userId.email },
    role: m.userId._id.toString() === ownerId ? 'owner' : m.role,
    joinedAt: m.joinedAt,
  }));
}

/** Verify that the caller is an admin or owner. */
async function requireAdminOrOwner(roomId: Types.ObjectId, userId: string) {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (room.ownerId.toString() === userId) {
    return { room, isOwner: true };
  }

  const member = await RoomMember.findOne({ roomId, userId: new Types.ObjectId(userId) }).lean();
  if (!member || member.role !== 'admin') {
    throw new ForbiddenError('Admin or owner privileges required');
  }

  return { room, isOwner: false };
}

// POST /api/v1/rooms/:id/admins/:userId  — promote to admin (owner only)
export async function promoteAdmin(roomId: string, ownerId: string, targetId: string): Promise<void> {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (room.ownerId.toString() !== ownerId) {
    throw new ForbiddenError('Only the owner can promote admins');
  }

  const result = await RoomMember.findOneAndUpdate(
    { roomId: new Types.ObjectId(roomId), userId: new Types.ObjectId(targetId) },
    { role: 'admin' },
  );

  if (!result) {
    throw new NotFoundError('User is not a member of this room');
  }
}

// DELETE /api/v1/rooms/:id/admins/:userId  — demote admin (owner only)
export async function demoteAdmin(roomId: string, ownerId: string, targetId: string): Promise<void> {
  const room = await Room.findById(roomId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (room.ownerId.toString() !== ownerId) {
    throw new ForbiddenError('Only the owner can demote admins');
  }

  const result = await RoomMember.findOneAndUpdate(
    { roomId: new Types.ObjectId(roomId), userId: new Types.ObjectId(targetId) },
    { role: 'member' },
  );

  if (!result) {
    throw new NotFoundError('User is not a member of this room');
  }
}

// POST /api/v1/rooms/:id/ban/:userId  — ban + remove member (admin/owner)
// Per spec §11: "remove member" = ban, so this is the single code path for both.
export async function banMember(roomId: string, callerId: string, targetId: string): Promise<void> {
  const roomObjectId = new Types.ObjectId(roomId);
  const targetObjectId = new Types.ObjectId(targetId);

  const { room, isOwner } = await requireAdminOrOwner(roomObjectId, callerId);

  // Owner cannot be banned
  if (room.ownerId.toString() === targetId) {
    throw new ForbiddenError('Cannot ban the room owner');
  }

  // Admins can only ban regular members; only owner can ban admins
  if (!isOwner) {
    const targetMember = await RoomMember.findOne({ roomId: roomObjectId, userId: targetObjectId }).lean();
    if (targetMember?.role === 'admin') {
      throw new ForbiddenError('Only the owner can ban admins');
    }
  }

  // Remove from members
  await RoomMember.findOneAndDelete({ roomId: roomObjectId, userId: targetObjectId });

  // Add ban record (upsert)
  await RoomBan.updateOne(
    { roomId: roomObjectId, userId: targetObjectId },
    { roomId: roomObjectId, userId: targetObjectId, bannedBy: new Types.ObjectId(callerId), bannedAt: new Date() },
    { upsert: true },
  );
}

// DELETE /api/v1/rooms/:id/ban/:userId  — unban (admin/owner)
export async function unbanMember(roomId: string, callerId: string, targetId: string): Promise<void> {
  const roomObjectId = new Types.ObjectId(roomId);

  await requireAdminOrOwner(roomObjectId, callerId);

  const result = await RoomBan.findOneAndDelete({
    roomId: roomObjectId,
    userId: new Types.ObjectId(targetId),
  });

  if (!result) {
    throw new NotFoundError('Ban not found');
  }
}

// GET /api/v1/rooms/:id/bans
export async function getBans(roomId: string, callerId: string) {
  const roomObjectId = new Types.ObjectId(roomId);

  await requireAdminOrOwner(roomObjectId, callerId);

  const bans = await RoomBan.find({ roomId: roomObjectId })
    .populate<{ userId: { _id: Types.ObjectId; username: string } }>('userId', '_id username')
    .populate<{ bannedBy: { _id: Types.ObjectId; username: string } }>('bannedBy', '_id username')
    .lean();

  return bans.map((b) => ({
    id: String(b._id),
    user: { id: String(b.userId._id), username: b.userId.username },
    bannedBy: { id: String(b.bannedBy._id), username: b.bannedBy.username },
    bannedAt: b.bannedAt,
  }));
}

// GET /api/v1/rooms/invitations/pending  — all pending invitations for current user
export async function getPendingInvitations(userId: string) {
  const invitations = await RoomInvitation.find({
    invitedUser: new Types.ObjectId(userId),
    status: 'pending',
  })
    .populate<{ roomId: { _id: Types.ObjectId; name: string } }>('roomId', '_id name')
    .lean();

  return invitations.map((inv) => ({
    invitationId: String(inv._id),
    roomId: String((inv.roomId as unknown as { _id: Types.ObjectId; name: string })._id),
    roomName: (inv.roomId as unknown as { _id: Types.ObjectId; name: string }).name,
  }));
}

// POST /api/v1/rooms/:id/invitations  — invite user to private room (admin/owner)
export async function sendInvitation(
  roomId: string,
  callerId: string,
  username: string,
): Promise<{ invitedUserId: string; invitationId: string; roomName: string }> {
  const roomObjectId = new Types.ObjectId(roomId);

  const { room } = await requireAdminOrOwner(roomObjectId, callerId);

  const target = await User.findOne({ username, deletedAt: null }).lean();
  if (!target) {
    throw new NotFoundError('User not found');
  }

  const targetObjectId = target._id as Types.ObjectId;

  const alreadyMember = await RoomMember.findOne({ roomId: roomObjectId, userId: targetObjectId }).lean();
  if (alreadyMember) {
    throw new ConflictError('User is already a member');
  }

  const banned = await RoomBan.findOne({ roomId: roomObjectId, userId: targetObjectId }).lean();
  if (banned) {
    throw new ForbiddenError('User is banned from this room');
  }

  const existing = await RoomInvitation.findOne({
    roomId: roomObjectId,
    invitedUser: targetObjectId,
    status: 'pending',
  }).lean();

  if (existing) {
    throw new ConflictError('Invitation already pending');
  }

  const invitation = await RoomInvitation.create({
    roomId: roomObjectId,
    invitedBy: new Types.ObjectId(callerId),
    invitedUser: targetObjectId,
  });

  return {
    invitedUserId: targetObjectId.toString(),
    invitationId: invitation._id.toString(),
    roomName: room.name,
  };
}

// PUT /api/v1/rooms/:id/invitations/:invId  — accept or reject
export async function respondToInvitation(
  roomId: string,
  userId: string,
  invitationId: string,
  action: 'accept' | 'reject',
): Promise<{ accepted: boolean }> {
  const roomObjectId = new Types.ObjectId(roomId);
  const userObjectId = new Types.ObjectId(userId);

  const invitation = await RoomInvitation.findOne({
    _id: invitationId,
    roomId: roomObjectId,
    invitedUser: userObjectId,
    status: 'pending',
  });

  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  invitation.status = action === 'accept' ? 'accepted' : 'rejected';
  await invitation.save();

  if (action === 'accept') {
    await RoomMember.updateOne(
      { roomId: roomObjectId, userId: userObjectId },
      { roomId: roomObjectId, userId: userObjectId, role: 'member', joinedAt: new Date() },
      { upsert: true },
    );
  }

  return { accepted: action === 'accept' };
}
