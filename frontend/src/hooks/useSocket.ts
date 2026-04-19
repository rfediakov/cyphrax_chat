import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { useChatStore } from '../store/chat.store';
import { usePresenceStore } from '../store/presence.store';

interface TypingPayload {
  userId: string;
  username: string;
  contextId: string;
}

interface PresencePayload {
  userId: string;
  status: 'online' | 'afk' | 'offline';
}

interface MessagePayload {
  _id: string;
  roomId?: string;
  dialogId?: string;
  [key: string]: unknown;
}

interface RoomEventPayload {
  event: string;
  roomId: string;
  [key: string]: unknown;
}

// Ephemeral typing state keyed by contextId — not in Zustand since it's transient
export const typingUsers: Record<string, { userId: string; username: string; timeout: ReturnType<typeof setTimeout> }[]> = {};

function addTypingUser(contextId: string, userId: string, username: string) {
  if (!typingUsers[contextId]) typingUsers[contextId] = [];
  const existing = typingUsers[contextId].find((u) => u.userId === userId);
  if (existing) {
    clearTimeout(existing.timeout);
    existing.timeout = setTimeout(() => removeTypingUser(contextId, userId), 3000);
    return;
  }
  const timeout = setTimeout(() => removeTypingUser(contextId, userId), 3000);
  typingUsers[contextId].push({ userId, username, timeout });
}

function removeTypingUser(contextId: string, userId: string) {
  if (!typingUsers[contextId]) return;
  typingUsers[contextId] = typingUsers[contextId].filter((u) => u.userId !== userId);
}

let socketSingleton: Socket | null = null;

export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const appendMessage = useChatStore((s) => s.appendMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const softDeleteMessage = useChatStore((s) => s.softDeleteMessage);
  const incrementUnread = useChatStore((s) => s.incrementUnread);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const activeDialogUserId = useChatStore((s) => s.activeDialogUserId);

  const setStatus = usePresenceStore((s) => s.setStatus);

  useEffect(() => {
    if (!accessToken) {
      if (socketSingleton) {
        socketSingleton.disconnect();
        socketSingleton = null;
      }
      setConnected(false);
      return;
    }

    if (socketSingleton?.connected && socketRef.current === socketSingleton) {
      return;
    }

    if (socketSingleton) {
      socketSingleton.disconnect();
    }

    const socket = io('/', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socketSingleton = socket;
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] connected', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] connection error:', err.message);
    });

    socket.on('message', (msg: MessagePayload) => {
      const contextId = msg.roomId ?? msg.dialogId;
      if (!contextId) return;

      appendMessage(contextId, msg as unknown as Parameters<typeof appendMessage>[1]);

      const isActive =
        contextId === activeRoomId ||
        (msg.dialogId != null && activeDialogUserId != null);

      if (!isActive) {
        incrementUnread(contextId);
      }
    });

    socket.on('message_edited', (msg: MessagePayload) => {
      const contextId = msg.roomId ?? msg.dialogId;
      if (!contextId) return;
      updateMessage(contextId, msg as unknown as Parameters<typeof updateMessage>[1]);
    });

    socket.on('message_deleted', (payload: { msgId: string; roomId?: string; dialogId?: string }) => {
      const contextId = payload.roomId ?? payload.dialogId;
      if (!contextId) return;
      softDeleteMessage(contextId, payload.msgId);
    });

    socket.on('presence', ({ userId, status }: PresencePayload) => {
      setStatus(userId, status);
    });

    socket.on('room_event', (_payload: RoomEventPayload) => {
      // TODO(agent-7): refresh room member list when relevant room is active
    });

    socket.on('friend_request', (payload: { fromUser: { username: string } }) => {
      console.info('[Socket] friend_request from', payload.fromUser.username);
      // TODO(agent-8): show toast notification
    });

    socket.on('typing', ({ userId, username, contextId }: TypingPayload) => {
      addTypingUser(contextId, userId, username);
    });

    return () => {
      // Only disconnect if token changes (i.e., this cleanup is for re-connect)
      // Do not disconnect on every render
    };
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return { socket: socketRef.current, connected };
}
