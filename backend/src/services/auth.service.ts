import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../config.js';
import { User } from '../models/user.model.js';
import { Session } from '../models/session.model.js';
import { Room } from '../models/room.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { RoomBan } from '../models/roomBan.model.js';
import { RoomInvitation } from '../models/roomInvitation.model.js';
import { Message } from '../models/message.model.js';
import { Attachment } from '../models/attachment.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/errors.js';
import { NON_LOGINABLE_PASSWORD_HASH } from '../lib/auth.constants.js';

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sessionId }, config.jwtSecret, {
    expiresIn: config.jwtAccessExpiresIn,
    algorithm: 'HS256',
  });
}

const DEFAULT_ROOM_NAME = 'Random';

/**
 * Lookup (or lazily create) the global default "Random" room and ensure the
 * given user is a member. Every new account is enrolled here so they always
 * land in a populated group on first login.
 */
async function ensureMembershipInDefaultRoom(userId: Types.ObjectId): Promise<void> {
  let roomId: Types.ObjectId | null = null;
  const existing = await Room.findOne({ name: DEFAULT_ROOM_NAME }).select('_id').lean();
  if (existing) {
    roomId = existing._id as Types.ObjectId;
  } else {
    try {
      const created = await Room.create({
        name: DEFAULT_ROOM_NAME,
        description: 'Default public room — say hi to everyone!',
        visibility: 'public',
        // The first registrant owns the room. This is fine for a public
        // gathering space; ownership only governs delete/rename here.
        ownerId: userId,
      });
      roomId = created._id as Types.ObjectId;
    } catch {
      // A concurrent registration may have created it first — re-fetch.
      const reFetched = await Room.findOne({ name: DEFAULT_ROOM_NAME })
        .select('_id')
        .lean();
      roomId = (reFetched?._id as Types.ObjectId | undefined) ?? null;
    }
  }

  if (!roomId) return;

  await RoomMember.updateOne(
    { roomId, userId },
    {
      roomId,
      userId,
      role: 'member',
      joinedAt: new Date(),
    },
    { upsert: true },
  );
}

export async function register(params: {
  email: string;
  username: string;
  password: string;
}): Promise<{ id: string; email: string; username: string }> {
  const { email, username, password } = params;

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
    deletedAt: null,
  }).lean();

  if (existing) {
    if (existing.email === email.toLowerCase()) {
      throw new ConflictError('Email already in use');
    }
    throw new ConflictError('Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);
  const user = await User.create({ email, username, passwordHash });

  // Auto-enroll new account in the public "Random" room so they always have at
  // least one populated group to interact with — including a shared map view.
  await ensureMembershipInDefaultRoom(user._id as Types.ObjectId);

  return { id: String(user._id), email: user.email, username: user.username };
}

export async function login(
  params: { email: string; password: string },
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const { email, password } = params;

  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(
    Date.now() + config.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000,
  );

  const session = await Session.create({
    userId: user._id,
    tokenHash,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    expiresAt,
  });

  const accessToken = signAccessToken(String(user._id), String(session._id));

  return { accessToken, refreshToken: rawRefreshToken, sessionId: String(session._id) };
}

/**
 * Create a throwaway guest account and issue tokens so unauthenticated visitors
 * can browse public rooms and chat without registering.
 */
export async function loginAsGuest(
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: { id: string; email: string; username: string; isGuest: true };
}> {
  const suffix = crypto.randomBytes(4).toString('hex');
  const username = `guest_${suffix}`;
  const email = `guest-${suffix}@guest.safegroup.local`;

  const user = await User.create({
    email,
    username,
    passwordHash: NON_LOGINABLE_PASSWORD_HASH,
    isGuest: true,
  });

  await ensureMembershipInDefaultRoom(user._id as Types.ObjectId);

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(
    Date.now() + config.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000,
  );

  const session = await Session.create({
    userId: user._id,
    tokenHash,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    expiresAt,
  });

  const accessToken = signAccessToken(String(user._id), String(session._id));

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    sessionId: String(session._id),
    user: {
      id: String(user._id),
      email: user.email,
      username: user.username,
      isGuest: true as const,
    },
  };
}

export async function logout(sessionId: string): Promise<void> {
  await Session.findByIdAndUpdate(sessionId, { revokedAt: new Date() });
}

export async function refreshTokens(
  rawRefreshToken: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const tokenHash = hashToken(rawRefreshToken);

  const session = await Session.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Revoke old session
  session.revokedAt = new Date();
  await session.save();

  // Issue new session
  const newRawToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawToken);
  const expiresAt = new Date(
    Date.now() + config.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000,
  );

  const newSession = await Session.create({
    userId: session.userId,
    tokenHash: newTokenHash,
    userAgent: meta.userAgent ?? session.userAgent,
    ipAddress: meta.ipAddress ?? session.ipAddress,
    expiresAt,
  });

  const accessToken = signAccessToken(String(session.userId), String(newSession._id));

  return { accessToken, refreshToken: newRawToken, sessionId: String(newSession._id) };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
  if (!user) {
    // Don't reveal whether the email exists
    return;
  }

  const resetToken = jwt.sign({ sub: String(user._id), purpose: 'password-reset' }, config.jwtSecret, {
    expiresIn: '1h',
    algorithm: 'HS256',
  });

  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
  console.log(`[PasswordReset] Reset URL for ${email}: ${resetUrl}`);
}

export async function resetPassword(resetToken: string, newPassword: string): Promise<void> {
  let payload: { sub: string; purpose: string };
  try {
    payload = jwt.verify(resetToken, config.jwtSecret) as typeof payload;
  } catch {
    throw new BadRequestError('Invalid or expired reset token');
  }

  if (payload.purpose !== 'password-reset') {
    throw new BadRequestError('Invalid reset token');
  }

  const user = await User.findOne({ _id: payload.sub, deletedAt: null });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  user.passwordHash = await bcrypt.hash(newPassword, config.bcryptSaltRounds);
  await user.save();

  // Revoke all existing sessions to force re-login
  await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    throw new BadRequestError('Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, config.bcryptSaltRounds);
  await user.save();
}

export async function deleteAccount(userId: string): Promise<void> {
  const userObjectId = new Types.ObjectId(userId);

  // 1. Delete all rooms owned by the user (with cascade)
  const ownedRooms = await Room.find({ ownerId: userObjectId }).lean();
  for (const room of ownedRooms) {
    const roomId = room._id as Types.ObjectId;
    const roomMessages = await Message.find({ roomId }).lean();
    const messageIds = roomMessages.map((m) => m._id as Types.ObjectId);

    if (messageIds.length > 0) {
      await Attachment.deleteMany({ messageId: { $in: messageIds } });
      await Message.deleteMany({ roomId });
    }

    await RoomMember.deleteMany({ roomId });
    await RoomBan.deleteMany({ roomId });
    await RoomInvitation.deleteMany({ roomId });
    await Room.findByIdAndDelete(roomId);
  }

  // 2. Remove user from all other rooms' member lists
  await RoomMember.deleteMany({ userId: userObjectId });

  // 3. Update friend requests referencing this user
  await FriendRequest.updateMany(
    { $or: [{ fromUser: userObjectId }, { toUser: userObjectId }] },
    { status: 'rejected' },
  );

  // 4. Delete all sessions
  await Session.deleteMany({ userId: userObjectId });

  // 5. Soft-delete the user
  await User.findByIdAndUpdate(userObjectId, { deletedAt: new Date() });
}
