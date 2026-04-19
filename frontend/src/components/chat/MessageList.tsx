import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../../store/chat.store';
import { useInfiniteMessages } from '../../hooks/useInfiniteMessages';
import { MessageItem } from './MessageItem';
import { editRoomMessage, deleteRoomMessage, editDialogMessage, deleteDialogMessage } from '../../api/messages.api';
import type { Message } from '../../store/chat.store';

interface MessageListProps {
  contextId: string;
  contextType: 'room' | 'dialog';
  dialogUserId?: string;
  isAdmin?: boolean;
  typingUsers: { userId: string; username: string }[];
  onReply: (message: Message) => void;
}

export function MessageList({
  contextId,
  contextType,
  dialogUserId,
  isAdmin,
  typingUsers,
  onReply,
}: MessageListProps) {
  const messages = useChatStore((s) => s.messages[contextId] ?? []);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const softDeleteMessage = useChatStore((s) => s.softDeleteMessage);

  const { loading, initialLoading, hasMore, loadInitial, loadOlder } = useInfiniteMessages({
    contextId,
    contextType,
    dialogUserId,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // Load initial messages when context changes
  useEffect(() => {
    loadInitial();
  }, [contextId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages (only when already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Preserve scroll position when prepending older messages
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 80;

    if (el.scrollTop < 200 && hasMore && !loading) {
      prevScrollHeightRef.current = el.scrollHeight;
      loadOlder();
    }
  }, [hasMore, loading, loadOlder]);

  // Restore scroll position after older messages are prepended
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScrollHeightRef.current === 0) return;
    const delta = el.scrollHeight - prevScrollHeightRef.current;
    if (delta > 0) {
      el.scrollTop += delta;
      prevScrollHeightRef.current = 0;
    }
  }, [messages.length]);

  const handleEdit = useCallback(
    async (message: Message) => {
      const newContent = window.prompt('Edit message:', message.content);
      if (!newContent || newContent === message.content) return;
      try {
        const response =
          contextType === 'room'
            ? await editRoomMessage(contextId, message._id, { content: newContent })
            : await editDialogMessage(dialogUserId ?? contextId, message._id, { content: newContent });
        updateMessage(contextId, response.data.message);
      } catch {
        // Error handled silently — server will emit message_edited via socket if it succeeds
      }
    },
    [contextId, contextType, dialogUserId, updateMessage]
  );

  const handleDelete = useCallback(
    async (message: Message) => {
      if (!window.confirm('Delete this message?')) return;
      try {
        if (contextType === 'room') {
          await deleteRoomMessage(contextId, message._id);
        } else {
          await deleteDialogMessage(dialogUserId ?? contextId, message._id);
        }
        softDeleteMessage(contextId, message._id);
      } catch {
        // Server will emit message_deleted via socket
      }
    },
    [contextId, contextType, dialogUserId, softDeleteMessage]
  );

  if (initialLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm">Loading messages…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-1 py-2 space-y-0.5 scroll-smooth"
      >
        {/* Load older spinner */}
        {loading && (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
              Loading older messages…
            </div>
          </div>
        )}

        {/* No more history */}
        {!hasMore && messages.length > 0 && (
          <p className="text-center text-xs text-gray-600 py-2">Beginning of conversation</p>
        )}

        {messages.length === 0 && !loading && (
          <p className="text-center text-gray-500 text-sm mt-8">No messages yet. Say hello!</p>
        )}

        {messages.map((msg) => (
          <MessageItem
            key={msg._id}
            message={msg}
            isAdmin={isAdmin}
            onReply={onReply}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}

        {/* Typing indicators */}
        {typingUsers.length > 0 && (
          <div className="px-3 py-1 text-xs text-gray-400 italic">
            {typingUsers.map((u) => u.username).join(', ')}{' '}
            {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
