import { Types } from 'mongoose';
import { Message } from '../models/message.model.js';
import { Attachment } from '../models/attachment.model.js';
import { Room } from '../models/room.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { Dialog } from '../models/dialog.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';
import { UserBan } from '../models/userBan.model.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';

const MAX_MESSAGE_BYTES = 3072;
const DEFAULT_PAGE_SIZE = 50;

function toPublic<T extends { _id: unknown }>(doc: T) {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

function validateContent(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > MAX_MESSAGE_BYTES) {
    throw new BadRequestError('Message exceeds 3 KB limit');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMessage(msg: any) {
  const { _id, authorId, ...rest } = msg as Record<string, unknown>;

  // authorId may be a populated User object ({ _id, username }) or a raw ObjectId
  let author: { _id: string; username: string };
  if (authorId && typeof authorId === 'object' && 'username' in (authorId as object)) {
    const u = authorId as { _id: unknown; username: string };
    author = { _id: String(u._id), username: u.username };
  } else {
    author = { _id: String(authorId), username: 'Unknown' };
  }

  return {
    _id: String(_id),
    ...rest,
    author,
    content: (msg as { deletedAt?: unknown; content: string }).deletedAt
      ? '[deleted]'
      : (msg as { content: string }).content,
  };
}

// ---------------------------------------------------------------------------
// Room messages
// ---------------------------------------------------------------------------

async function requireRoomMember(roomId: Types.ObjectId, userId: Types.ObjectId) {
  const member = await RoomMember.findOne({ roomId, userId }).lean();
  if (!member) {
    throw new ForbiddenError('You are not a member of this room');
  }
  return member;
}

// GET /api/v1/rooms/:id/messages?before=<objectId>&limit=50
export async function getRoomMessages(
  roomId: string,
  userId: string,
  before?: string,
  limit = DEFAULT_PAGE_SIZE,
) {
  const roomObjectId = new Types.ObjectId(roomId);
  await requireRoomMember(roomObjectId, new Types.ObjectId(userId));

  const filter: Record<string, unknown> = { roomId: roomObjectId };
  if (before) {
    filter._id = { $lt: new Types.ObjectId(before) };
  }

  const messages = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit)
    .populate<{ authorId: { _id: Types.ObjectId; username: string } }>('authorId', '_id username')
    .lean();

  const nextCursor =
    messages.length === limit ? String((messages[messages.length - 1] as { _id: Types.ObjectId })._id) : null;

  return {
    data: messages.map(serializeMessage),
    nextCursor,
  };
}

// POST /api/v1/rooms/:id/messages
export async function sendRoomMessage(
  roomId: string,
  userId: string,
  content: string,
  replyToId?: string,
  attachmentId?: string,
) {
  validateContent(content);

  const roomObjectId = new Types.ObjectId(roomId);
  const userObjectId = new Types.ObjectId(userId);

  const room = await Room.findById(roomObjectId).lean();
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  await requireRoomMember(roomObjectId, userObjectId);

  const msg = await Message.create({
    roomId: roomObjectId,
    authorId: userObjectId,
    content,
    replyToId: replyToId ? new Types.ObjectId(replyToId) : null,
  });

  // Link pending attachment to this message
  if (attachmentId) {
    await Attachment.findByIdAndUpdate(attachmentId, { messageId: msg._id });
  }

  await msg.populate('authorId', '_id username');
  return serializeMessage(msg.toObject());
}

// PUT /api/v1/rooms/:id/messages/:msgId
export async function editRoomMessage(
  roomId: string,
  userId: string,
  msgId: string,
  content: string,
) {
  validateContent(content);

  const msg = await Message.findOne({
    _id: msgId,
    roomId: new Types.ObjectId(roomId),
    deletedAt: null,
  });

  if (!msg) {
    throw new NotFoundError('Message not found');
  }

  if (msg.authorId.toString() !== userId) {
    throw new ForbiddenError('You can only edit your own messages');
  }

  msg.content = content;
  msg.editedAt = new Date();
  await msg.save();
  await msg.populate('authorId', '_id username');

  return serializeMessage(msg.toObject());
}

// DELETE /api/v1/rooms/:id/messages/:msgId  (soft-delete: author or admin)
export async function deleteRoomMessage(
  roomId: string,
  userId: string,
  msgId: string,
): Promise<void> {
  const roomObjectId = new Types.ObjectId(roomId);

  const msg = await Message.findOne({
    _id: msgId,
    roomId: roomObjectId,
    deletedAt: null,
  });

  if (!msg) {
    throw new NotFoundError('Message not found');
  }

  const isAuthor = msg.authorId.toString() === userId;

  if (!isAuthor) {
    const room = await Room.findById(roomObjectId).lean();
    const isAdminOrOwner =
      room?.ownerId.toString() === userId ||
      (await RoomMember.findOne({
        roomId: roomObjectId,
        userId: new Types.ObjectId(userId),
        role: 'admin',
      }).lean()) !== null;

    if (!isAdminOrOwner) {
      throw new ForbiddenError('You cannot delete this message');
    }
  }

  msg.deletedAt = new Date();
  await msg.save();
}

// ---------------------------------------------------------------------------
// Dialog messages
// ---------------------------------------------------------------------------

/** Sort two ObjectId strings and upsert a Dialog document. */
async function findOrCreateDialog(
  userAId: Types.ObjectId,
  userBId: Types.ObjectId,
): Promise<{ dialog: { _id: Types.ObjectId } }> {
  // Sort so that the index uniqueness is guaranteed regardless of call order
  const sorted = [userAId, userBId].sort((a, b) => a.toString().localeCompare(b.toString()));

  const dialog = await Dialog.findOneAndUpdate(
    { participants: sorted },
    { participants: sorted },
    { upsert: true, new: true },
  ).lean();

  return { dialog: dialog as { _id: Types.ObjectId } };
}

async function requireFriends(userId: string, otherUserId: string): Promise<void> {
  const userObjectId = new Types.ObjectId(userId);
  const otherObjectId = new Types.ObjectId(otherUserId);

  // Check ban in either direction — returns 403
  const ban = await UserBan.findOne({
    $or: [
      { blockerId: userObjectId, blockedId: otherObjectId },
      { blockerId: otherObjectId, blockedId: userObjectId },
    ],
  }).lean();

  if (ban) {
    throw new ForbiddenError('Messaging is blocked between these users');
  }

  // Must be accepted friends
  const friendship = await FriendRequest.findOne({
    $or: [
      { fromUser: userObjectId, toUser: otherObjectId },
      { fromUser: otherObjectId, toUser: userObjectId },
    ],
    status: 'accepted',
  }).lean();

  if (!friendship) {
    throw new ForbiddenError('You must be friends to send a direct message');
  }
}

/**
 * Returns the dialogId string for the dialog between two users (creates it if needed).
 * Used by routes that need the dialogId before a delete operation.
 */
export async function getDialogId(callerId: string, otherUserId: string): Promise<string | null> {
  try {
    const callerObjectId = new Types.ObjectId(callerId);
    const otherObjectId = new Types.ObjectId(otherUserId);
    const { dialog } = await findOrCreateDialog(callerObjectId, otherObjectId);
    return dialog._id.toString();
  } catch {
    return null;
  }
}

// GET /api/v1/dialogs
export async function getDialogs(userId: string) {
  const userObjectId = new Types.ObjectId(userId);

  const dialogs = await Dialog.find({ participants: userObjectId })
    .populate<{
      participants: Array<{ _id: Types.ObjectId; username: string; email: string }>;
    }>('participants', '_id username email')
    .lean();

  const results = await Promise.all(
    dialogs.map(async (d) => {
      const lastMessage = await Message.findOne({ dialogId: d._id })
        .sort({ _id: -1 })
        .lean();

      const other = d.participants.find((p) => p._id.toString() !== userId);

      return {
        id: String(d._id),
        otherUser: other ? { id: String(other._id), username: other.username } : null,
        lastMessage: lastMessage ? serializeMessage(lastMessage as Record<string, unknown>) : null,
        updatedAt: d.updatedAt,
      };
    }),
  );

  return results;
}

// GET /api/v1/dialogs/:userId/messages?before=&limit=50
export async function getDialogMessages(
  callerId: string,
  otherUserId: string,
  before?: string,
  limit = DEFAULT_PAGE_SIZE,
) {
  const callerObjectId = new Types.ObjectId(callerId);
  const otherObjectId = new Types.ObjectId(otherUserId);

  const { dialog } = await findOrCreateDialog(callerObjectId, otherObjectId);

  const filter: Record<string, unknown> = { dialogId: dialog._id };
  if (before) {
    filter._id = { $lt: new Types.ObjectId(before) };
  }

  const messages = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit)
    .populate<{ authorId: { _id: Types.ObjectId; username: string } }>('authorId', '_id username')
    .lean();

  const nextCursor =
    messages.length === limit ? String((messages[messages.length - 1] as { _id: Types.ObjectId })._id) : null;

  return {
    data: messages.map(serializeMessage),
    nextCursor,
  };
}

// POST /api/v1/dialogs/:userId/messages  (friends only, no ban)
export async function sendDialogMessage(
  callerId: string,
  otherUserId: string,
  content: string,
  replyToId?: string,
  attachmentId?: string,
): Promise<{ message: ReturnType<typeof serializeMessage>; dialogId: string }> {
  validateContent(content);

  await requireFriends(callerId, otherUserId);

  const callerObjectId = new Types.ObjectId(callerId);
  const otherObjectId = new Types.ObjectId(otherUserId);

  const { dialog } = await findOrCreateDialog(callerObjectId, otherObjectId);
  const dialogId = dialog._id.toString();

  const msg = await Message.create({
    dialogId: dialog._id,
    authorId: callerObjectId,
    content,
    replyToId: replyToId ? new Types.ObjectId(replyToId) : null,
  });

  if (attachmentId) {
    await Attachment.findByIdAndUpdate(attachmentId, { messageId: msg._id });
  }

  await msg.populate('authorId', '_id username');
  return { message: serializeMessage(msg.toObject()), dialogId };
}

// PUT /api/v1/dialogs/:userId/messages/:msgId
export async function editDialogMessage(
  callerId: string,
  otherUserId: string,
  msgId: string,
  content: string,
): Promise<{ message: ReturnType<typeof serializeMessage>; dialogId: string }> {
  validateContent(content);

  const callerObjectId = new Types.ObjectId(callerId);
  const otherObjectId = new Types.ObjectId(otherUserId);

  const { dialog } = await findOrCreateDialog(callerObjectId, otherObjectId);
  const dialogId = dialog._id.toString();

  const msg = await Message.findOne({
    _id: msgId,
    dialogId: dialog._id,
    deletedAt: null,
  });

  if (!msg) {
    throw new NotFoundError('Message not found');
  }

  if (msg.authorId.toString() !== callerId) {
    throw new ForbiddenError('You can only edit your own messages');
  }

  msg.content = content;
  msg.editedAt = new Date();
  await msg.save();
  await msg.populate('authorId', '_id username');

  return { message: serializeMessage(msg.toObject()), dialogId };
}

// DELETE /api/v1/dialogs/:userId/messages/:msgId  (soft-delete: author only)
export async function deleteDialogMessage(
  callerId: string,
  otherUserId: string,
  msgId: string,
): Promise<void> {
  const callerObjectId = new Types.ObjectId(callerId);
  const otherObjectId = new Types.ObjectId(otherUserId);

  const { dialog } = await findOrCreateDialog(callerObjectId, otherObjectId);

  const msg = await Message.findOne({
    _id: msgId,
    dialogId: dialog._id,
    deletedAt: null,
  });

  if (!msg) {
    throw new NotFoundError('Message not found');
  }

  if (msg.authorId.toString() !== callerId) {
    throw new ForbiddenError('You can only delete your own messages');
  }

  msg.deletedAt = new Date();
  await msg.save();
}
