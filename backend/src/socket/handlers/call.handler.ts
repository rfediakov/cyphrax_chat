import { Socket, Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Call } from '../../models/call.model.js';
import { RoomMember } from '../../models/roomMember.model.js';
import { Dialog } from '../../models/dialog.model.js';
import type { CallType } from '../../models/call.model.js';

const MAX_MESH_PARTICIPANTS = 8;

/** Active call map: callId → Set of socketIds currently in it */
const activeCalls = new Map<string, Set<string>>();

/**
 * Verify the user is allowed to participate in this call:
 *   – 1-1 call: caller or invited callee
 *   – group call: any current room member
 * Returns false if the call doesn't exist or the user isn't allowed.
 */
async function userMayParticipateInCall(callId: string, userId: string): Promise<boolean> {
  const call = await Call.findOne({ callId }).lean();
  if (!call) return false;

  if (call.calleeId) {
    return call.callerId.toString() === userId || call.calleeId.toString() === userId;
  }

  if (call.roomId) {
    const member = await RoomMember.findOne({
      roomId: call.roomId,
      userId,
    }).lean();
    return !!member;
  }

  return false;
}

async function resolveTargetRoom(
  callerId: string,
  calleeId?: string,
  roomId?: string,
): Promise<string | null> {
  if (calleeId) {
    // 1-1: find the dialog room or use personal socket room
    const dialog = await Dialog.findOne({ participants: { $all: [callerId, calleeId] } }).lean();
    if (!dialog) return null;
    return `dialog:${dialog._id}`;
  }
  if (roomId) {
    const member = await RoomMember.findOne({ userId: callerId, roomId }).lean();
    if (!member) return null;
    return `room:${roomId}`;
  }
  return null;
}

export function registerCallHandler(socket: Socket, io: Server): void {
  const userId = socket.data.userId as string;

  // ── call_invite: caller signals they want to start a call ─────────────────
  socket.on(
    'call_invite',
    async ({
      calleeId,
      roomId,
      type,
    }: {
      calleeId?: string;
      roomId?: string;
      type: CallType;
    }) => {
      try {
        const targetRoom = await resolveTargetRoom(userId, calleeId, roomId);
        if (!targetRoom) return;

        // For group calls, check participant count
        if (roomId) {
          const memberCount = await RoomMember.countDocuments({ roomId });
          if (memberCount > MAX_MESH_PARTICIPANTS) {
            socket.emit('call_error', {
              message: 'Group calls are limited to 8 participants (mesh WebRTC).',
            });
            return;
          }
        }

        const callId = uuidv4();

        await Call.create({
          callId,
          type,
          status: 'ringing',
          callerId: userId,
          calleeId: calleeId ?? undefined,
          roomId: roomId ?? undefined,
          participants: [userId],
        });

        // Notify target(s) — exclude the caller
        socket.to(targetRoom).emit('call_incoming', {
          callId,
          callerId: userId,
          type,
          roomId,
          calleeId,
        });

        // Also emit back to caller so they have the callId
        socket.emit('call_initiated', { callId });
      } catch (err) {
        console.error('[Call] call_invite error:', err);
      }
    },
  );

  // ── call_answer: callee accepted ─────────────────────────────────────────
  socket.on('call_answer', async ({ callId }: { callId: string }) => {
    try {
      const call = await Call.findOneAndUpdate(
        { callId, status: 'ringing' },
        { status: 'active', startedAt: new Date(), $addToSet: { participants: userId } },
        { new: true },
      ).lean();
      if (!call) return;

      // Track active participants
      if (!activeCalls.has(callId)) activeCalls.set(callId, new Set());
      activeCalls.get(callId)!.add(socket.id);

      // Tell caller the call was answered
      io.to(`user:${call.callerId}`).emit('call_answered', { callId, by: userId });
    } catch (err) {
      console.error('[Call] call_answer error:', err);
    }
  });

  // ── call_decline: callee rejected ────────────────────────────────────────
  socket.on('call_decline', async ({ callId }: { callId: string }) => {
    try {
      const call = await Call.findOneAndUpdate(
        { callId, status: 'ringing' },
        { status: 'declined', endedAt: new Date() },
        { new: true },
      ).lean();
      if (!call) return;

      io.to(`user:${call.callerId.toString()}`).emit('call_declined', { callId, by: userId });
    } catch (err) {
      console.error('[Call] call_decline error:', err);
    }
  });

  // ── call_end: any participant ends the call ───────────────────────────────
  socket.on('call_end', async ({ callId }: { callId: string }) => {
    try {
      const call = await Call.findOne({ callId }).lean();
      if (!call) return;

      // Only an actual participant may terminate the call.
      if (!(await userMayParticipateInCall(callId, userId))) return;

      const now = new Date();
      const duration = call.startedAt ? Math.floor((now.getTime() - call.startedAt.getTime()) / 1000) : 0;

      await Call.findOneAndUpdate(
        { callId },
        { status: 'ended', endedAt: now, duration },
      );

      // Notify all participants
      const targetRoom = await resolveTargetRoom(
        call.callerId.toString(),
        call.calleeId?.toString(),
        call.roomId?.toString(),
      );
      if (targetRoom) {
        io.to(targetRoom).emit('call_ended', { callId, endedBy: userId });
      }

      activeCalls.delete(callId);
    } catch (err) {
      console.error('[Call] call_end error:', err);
    }
  });

  // ── webrtc_offer: relay SDP offer to callee ───────────────────────────────
  socket.on(
    'webrtc_offer',
    async ({
      callId,
      targetUserId,
      sdp,
    }: {
      callId: string;
      targetUserId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      if (!(await userMayParticipateInCall(callId, userId))) return;
      if (!(await userMayParticipateInCall(callId, targetUserId))) return;
      io.to(`user:${targetUserId}`).emit('webrtc_offer', { callId, from: userId, sdp });
    },
  );

  // ── webrtc_answer: relay SDP answer back to caller ────────────────────────
  socket.on(
    'webrtc_answer',
    async ({
      callId,
      targetUserId,
      sdp,
    }: {
      callId: string;
      targetUserId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      if (!(await userMayParticipateInCall(callId, userId))) return;
      if (!(await userMayParticipateInCall(callId, targetUserId))) return;
      io.to(`user:${targetUserId}`).emit('webrtc_answer', { callId, from: userId, sdp });
    },
  );

  // ── webrtc_ice: relay ICE candidate ──────────────────────────────────────
  socket.on(
    'webrtc_ice',
    async ({
      callId,
      targetUserId,
      candidate,
    }: {
      callId: string;
      targetUserId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (!(await userMayParticipateInCall(callId, userId))) return;
      if (!(await userMayParticipateInCall(callId, targetUserId))) return;
      io.to(`user:${targetUserId}`).emit('webrtc_ice', { callId, from: userId, candidate });
    },
  );

  // ── Cleanup on disconnect ─────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      // Mark any ringing calls where this user is the caller as missed
      const ringing = await Call.find({ callerId: userId, status: 'ringing' }).lean();
      for (const call of ringing) {
        await Call.findOneAndUpdate(
          { callId: call.callId },
          { status: 'missed', endedAt: new Date() },
        );
        const targetRoom = await resolveTargetRoom(
          userId,
          call.calleeId?.toString(),
          call.roomId?.toString(),
        );
        if (targetRoom) {
          io.to(targetRoom).emit('call_ended', { callId: call.callId, endedBy: userId, reason: 'disconnect' });
        }
      }

      // End any active calls this socket was part of
      for (const [callId, sockets] of activeCalls) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            const call = await Call.findOneAndUpdate(
              { callId, status: 'active' },
              { status: 'ended', endedAt: new Date() },
              { new: true },
            ).lean();
            if (call) {
              const targetRoom = await resolveTargetRoom(
                call.callerId.toString(),
                call.calleeId?.toString(),
                call.roomId?.toString(),
              );
              if (targetRoom) {
                io.to(targetRoom).emit('call_ended', { callId, endedBy: userId, reason: 'disconnect' });
              }
            }
            activeCalls.delete(callId);
          }
        }
      }
    } catch (err) {
      console.error('[Call] disconnect cleanup error:', err);
    }
  });
}
