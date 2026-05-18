import { Socket, Server } from 'socket.io';
import { Types } from 'mongoose';
import { RoomMember } from '../../models/roomMember.model.js';
import { SOSEvent } from '../../models/sosEvent.model.js';
import { User } from '../../models/user.model.js';
import { redis } from '../../lib/redis.js';
import { sendPushToMany } from '../../services/push.service.js';

interface SOSTriggerData {
  roomId?: unknown;
  lat?: unknown;
  lng?: unknown;
  message?: unknown;
}

interface SOSResolveData {
  sosId?: unknown;
}

const SOS_TTL_SECONDS = 4 * 60 * 60; // 4 hours

export function registerSOSHandler(socket: Socket, io: Server): void {
  socket.on('sos_trigger', async (data: SOSTriggerData) => {
    const userId = socket.data.userId as string;

    if (
      typeof data?.roomId !== 'string' ||
      typeof data?.lat !== 'number' ||
      typeof data?.lng !== 'number'
    ) {
      return;
    }

    const { roomId, lat, lng } = data;
    const message = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : "I'm in danger";

    try {
      // Verify user is a room member
      const membership = await RoomMember.findOne({
        roomId: new Types.ObjectId(roomId),
        userId: new Types.ObjectId(userId),
      }).lean();

      if (!membership) {
        socket.emit('sos_error', { message: 'Not a member of this room' });
        return;
      }

      // Fetch username for the alert payload
      const user = await User.findById(userId).lean();
      const username = user?.username ?? 'Unknown';

      // Persist SOS event
      const sosEvent = await SOSEvent.create({
        roomId: new Types.ObjectId(roomId),
        userId: new Types.ObjectId(userId),
        username,
        lat,
        lng,
        message,
        status: 'active',
      });

      const sosId = (sosEvent._id as Types.ObjectId).toString();

      // Cache in Redis with 4-hour TTL
      const cacheKey = `sos:${roomId}:${sosId}`;
      await redis.setex(
        cacheKey,
        SOS_TTL_SECONDS,
        JSON.stringify({
          _id: sosId,
          roomId,
          userId,
          username,
          lat,
          lng,
          message,
          status: 'active',
          createdAt: sosEvent.createdAt.toISOString(),
        }),
      );

      const alertPayload = {
        _id: sosId,
        roomId,
        userId,
        username,
        lat,
        lng,
        message,
        status: 'active',
        createdAt: sosEvent.createdAt.toISOString(),
      };

      // Broadcast to all room members
      io.to(`room:${roomId}`).emit('sos_alert', alertPayload);

      console.log(`[SOSHandler] SOS triggered by userId=${userId} in roomId=${roomId} sosId=${sosId}`);

      // Send push notification to all room members (background — don't block socket response)
      void (async () => {
        try {
          const members = await RoomMember.find({ roomId: new Types.ObjectId(roomId) }).lean();
          const otherMemberIds = members
            .map((m) => m.userId.toString())
            .filter((id) => id !== userId);

          await sendPushToMany(otherMemberIds, {
            title: '🚨 EMERGENCY ALERT',
            body: `${username} needs help! "${message}"`,
            tag: `sos-${sosId}`,
            data: { type: 'sos_alert', sosId, roomId },
          });
        } catch (err) {
          console.error('[SOSHandler] Push notification error:', err);
        }
      })();
    } catch (err) {
      console.error('[SOSHandler] sos_trigger error:', err);
      socket.emit('sos_error', { message: 'Failed to trigger SOS' });
    }
  });

  socket.on('sos_resolve', async (data: SOSResolveData) => {
    const userId = socket.data.userId as string;

    if (typeof data?.sosId !== 'string') return;

    const { sosId } = data;

    try {
      const sosEvent = await SOSEvent.findById(sosId);
      if (!sosEvent) {
        socket.emit('sos_error', { message: 'SOS event not found' });
        return;
      }

      // Allow resolution by the victim or any room admin
      const isOwner = sosEvent.userId.toString() === userId;
      const isAdmin = await RoomMember.findOne({
        roomId: sosEvent.roomId,
        userId: new Types.ObjectId(userId),
        role: 'admin',
      }).lean();

      if (!isOwner && !isAdmin) {
        socket.emit('sos_error', { message: 'Not authorized to resolve this SOS' });
        return;
      }

      // Mark as resolved
      sosEvent.status = 'resolved';
      sosEvent.resolvedAt = new Date();
      await sosEvent.save();

      const roomId = sosEvent.roomId.toString();

      // Remove from Redis cache
      await redis.del(`sos:${roomId}:${sosId}`);

      // Broadcast resolution to room
      io.to(`room:${roomId}`).emit('sos_resolved', { sosId, roomId });

      console.log(`[SOSHandler] SOS resolved sosId=${sosId} by userId=${userId}`);
    } catch (err) {
      console.error('[SOSHandler] sos_resolve error:', err);
      socket.emit('sos_error', { message: 'Failed to resolve SOS' });
    }
  });
}
