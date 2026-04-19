import { useState, useCallback, useEffect } from 'react';
import { TopNav } from '../components/layout/TopNav';
import { LeftSidebar } from '../components/layout/LeftSidebar';
import { RightSidebar } from '../components/layout/RightSidebar';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useChatStore } from '../store/chat.store';
import { useSocket } from '../hooks/useSocket';
import { typingUsers as typingUsersMap } from '../hooks/useSocket';
import { useAuthStore } from '../store/auth.store';
import type { Message } from '../store/chat.store';
import { findDialogWithUser, getDialogRecordId } from '../lib/dialogs';

function useTypingUsers(contextId: string | null) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    // Re-render every 500 ms to clean up expired typing indicators
    const interval = setInterval(() => forceUpdate((n) => n + 1), 500);
    return () => clearInterval(interval);
  }, []);

  if (!contextId) return [];
  return typingUsersMap[contextId] ?? [];
}

export default function Chat() {
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const activeDialogUserId = useChatStore((s) => s.activeDialogUserId);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const rooms = useChatStore((s) => s.rooms);
  const dialogs = useChatStore((s) => s.dialogs);
  const clearUnread = useChatStore((s) => s.clearUnread);
  const currentUser = useAuthStore((s) => s.user);

  const { socket } = useSocket();

  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Determine the active context
  const activeContext = (() => {
    if (activeRoomId) {
      const room = rooms.find((r) => r._id === activeRoomId);
      return { contextId: activeRoomId, contextType: 'room' as const, name: room?.name ?? activeRoomId };
    }
    if (activeDialogUserId) {
      const dialog = findDialogWithUser(dialogs, activeDialogUserId);
      const dialogRecordId = dialog ? getDialogRecordId(dialog) : '';
      return {
        contextId: dialogRecordId || activeDialogUserId,
        contextType: 'dialog' as const,
        dialogUserId: activeDialogUserId,
        name: dialog?.otherUser?.username ?? activeDialogUserId,
      };
    }
    return null;
  })();

  // isAdmin is computed in RightSidebar via member list; MessageList receives it for delete permissions.
  // We pass false here since message-level admin actions are gated per-message in the list.
  const isAdmin = false;

  const typingUsers = useTypingUsers(activeContext?.contextId ?? null);

  // Clear unread and emit read event when opening a context
  useEffect(() => {
    if (!activeContext) return;
    clearUnread(activeContext.contextId);
    if (socket) {
      socket.emit('read', {
        contextId: activeContext.contextId,
        contextType: activeContext.contextType,
      });
    }
  }, [activeContext?.contextId, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
  }, []);

  const handleClearReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden">
      <TopNav />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — hidden on small screens while chatting so the message bar is usable */}
        <LeftSidebar mobileHidden={!!activeContext} />

        {/* Main content */}
        <main
          className={`flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden ${
            activeContext ? '' : 'hidden md:flex'
          }`}
        >
          {activeContext ? (
            <>
              {/* Chat header */}
              <div className="h-11 border-b border-gray-700 flex items-center px-2 sm:px-4 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveRoom(null)}
                  className="md:hidden shrink-0 p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                  aria-label="Back to rooms and contacts"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-gray-400 text-sm">{activeContext.contextType === 'room' ? '#' : '@'}</span>
                <h1 className="font-semibold text-white text-sm truncate min-w-0">{activeContext.name}</h1>
                {currentUser && (
                  <span className="ml-auto text-xs text-gray-500">
                    Signed in as <span className="text-gray-300">@{currentUser.username}</span>
                  </span>
                )}
              </div>

              {/* Messages */}
              <ErrorBoundary key={activeContext.contextId}>
                <MessageList
                  contextId={activeContext.contextId}
                  contextType={activeContext.contextType}
                  dialogUserId={activeContext.contextType === 'dialog' ? activeContext.dialogUserId : undefined}
                  isAdmin={isAdmin}
                  typingUsers={typingUsers}
                  onReply={handleReply}
                />
              </ErrorBoundary>

              {/* Input */}
              <MessageInput
                contextId={activeContext.contextId}
                contextType={activeContext.contextType}
                dialogUserId={activeContext.contextType === 'dialog' ? activeContext.dialogUserId : undefined}
                replyTo={replyTo}
                onClearReply={handleClearReply}
              />
            </>
          ) : (
            <WelcomeScreen />
          )}
        </main>

        {/* Right sidebar */}
        <RightSidebar />
      </div>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-white mb-2">Welcome to Cyphrax</h2>
      <p className="text-sm text-gray-400 max-w-xs">
        Select a room from the left sidebar to start chatting, or send a direct message to one of your contacts.
      </p>
    </div>
  );
}
