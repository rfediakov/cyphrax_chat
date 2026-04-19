import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { useChatStore } from '../store/chat.store';
import { usePresenceStore } from '../store/presence.store';
import { fetchPresenceStatuses } from '../api/presence.api';
import { useToast } from '../components/ui/Toast';
import { respondToInvitation } from '../api/rooms.api';

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

interface WrappedMessagePayload {
  message: MessagePayload;
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
  const setRooms = useChatStore((s) => s.setRooms);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const activeDialogUserId = useChatStore((s) => s.activeDialogUserId);

  const setStatus = usePresenceStore((s) => s.setStatus);
  const bulkSetStatuses = usePresenceStore((s) => s.bulkSetStatuses);
  const { showToast } = useToast();

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

    const activityThrottle = { current: false };

    const channel = new BroadcastChannel('presence_activity');

    const emitActivity = () => {
      if (!socketSingleton?.connected) return;
      if (document.visibilityState !== 'visible') return;
      if (activityThrottle.current) return;
      socketSingleton.emit('activity');
      activityThrottle.current = true;
      channel.postMessage('activity');
      setTimeout(() => { activityThrottle.current = false; }, 10_000);
    };

    // When a sibling tab reports activity, reset our throttle so we don't
    // incorrectly go AFK — the active tab already emitted to the server.
    channel.onmessage = () => {
      activityThrottle.current = true;
      setTimeout(() => { activityThrottle.current = false; }, 10_000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        emitActivity();
      }
    };

    window.addEventListener('mousemove', emitActivity, { passive: true });
    window.addEventListener('keydown', emitActivity, { passive: true });
    window.addEventListener('pointerdown', emitActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    socket.on('connect', () => {
      console.log('[Socket] connected', socket.id);
      setConnected(true);

      void (async () => {
        try {
          const { dialogs } = useChatStore.getState();
          const peerIds = new Set<string>();

          for (const d of dialogs) {
            const id = d.otherUser?._id ?? d.otherUser?.id;
            if (id) peerIds.add(id);
          }

          if (peerIds.size === 0) return;

          const statuses = await fetchPresenceStatuses([...peerIds]);
          bulkSetStatuses(statuses);
        } catch (err) {
          console.warn('[Presence] Initial sync failed:', err);
        }
      })();
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] connection error:', err.message);
    });

    socket.on('message', ({ message: msg }: WrappedMessagePayload) => {
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

    socket.on('message_edited', ({ message: msg }: WrappedMessagePayload) => {
      const contextId = msg.roomId ?? msg.dialogId;
      if (!contextId) return;
      updateMessage(contextId, msg as unknown as Parameters<typeof updateMessage>[1]);
    });

    socket.on('message_deleted', (payload: { messageId: string; roomId?: string; dialogId?: string }) => {
      const contextId = payload.roomId ?? payload.dialogId;
      if (!contextId) return;
      softDeleteMessage(contextId, payload.messageId);
    });

    socket.on('presence', ({ userId, status }: PresencePayload) => {
      setStatus(userId, status);
    });

    socket.on('room_event', (payload: RoomEventPayload) => {
      if (payload.event === 'invited') {
        const roomName = (payload.roomName as string | undefined) ?? payload.roomId;
        const invId = payload.invId as string | undefined;
        showToast(
          `You have been invited to #${roomName}`,
          'info',
          invId
            ? [
                {
                  label: 'Accept',
                  onClick: () => {
                    void respondToInvitation(payload.roomId, invId, 'accept').then(() => {
                      const rooms = useChatStore.getState().rooms;
                      // Room will appear after next sidebar reload; trigger refresh if needed
                      setRooms([...rooms]);
                    });
                  },
                },
                {
                  label: 'Reject',
                  onClick: () => {
                    void respondToInvitation(payload.roomId, invId, 'reject');
                  },
                },
              ]
            : undefined
        );
      }
    });

    socket.on(
      'friend_request',
      (payload: { fromUser?: { _id: string; username: string }; fromUserId?: string }) => {
        const username = payload.fromUser?.username;
        if (username) {
          showToast(`@${username} sent you a friend request.`, 'info');
          return;
        }
        showToast('You have a new friend request.', 'info');
      },
    );

    socket.on('typing', ({ userId, username, contextId }: TypingPayload) => {
      addTypingUser(contextId, userId, username);
    });

    return () => {
      window.removeEventListener('mousemove', emitActivity);
      window.removeEventListener('keydown', emitActivity);
      window.removeEventListener('pointerdown', emitActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      channel.close();
    };
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync presence when dialogs are loaded after the socket already connected
  // (handles the race condition where connect fires before dialogs are fetched)
  const dialogs = useChatStore((s) => s.dialogs);
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    if (!connected) {
      hasSyncedRef.current = false;
    }
  }, [connected]);

  useEffect(() => {
    if (!connected || dialogs.length === 0 || hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    void (async () => {
      try {
        const peerIds = new Set<string>();
        for (const d of dialogs) {
          const id = d.otherUser?._id ?? d.otherUser?.id;
          if (id) peerIds.add(id);
        }
        if (peerIds.size === 0) return;
        const statuses = await fetchPresenceStatuses([...peerIds]);
        bulkSetStatuses(statuses);
      } catch (err) {
        console.warn('[Presence] Deferred sync failed:', err);
      }
    })();
  }, [connected, dialogs, bulkSetStatuses]);

  return { socket: socketRef.current, connected };
}
