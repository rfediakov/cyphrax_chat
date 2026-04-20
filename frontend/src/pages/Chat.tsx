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
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

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

  // Close mobile right panel when switching rooms
  useEffect(() => {
    setRightSidebarOpen(false);
  }, [activeRoomId]);

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

  // Activity tracking: mouse, keyboard, and page visibility — throttled to 10s
  useEffect(() => {
    if (!socket) return;

    const THROTTLE_MS = 10_000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const emitActivity = () => {
      if (timer) return;
      socket.emit('activity');
      timer = setTimeout(() => {
        timer = null;
      }, THROTTLE_MS);
    };

    const handleVisibility = () => {
      if (!document.hidden) emitActivity();
    };

    window.addEventListener('mousemove', emitActivity, { passive: true });
    window.addEventListener('keydown', emitActivity, { passive: true });
    window.addEventListener('focus', emitActivity);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('mousemove', emitActivity);
      window.removeEventListener('keydown', emitActivity);
      window.removeEventListener('focus', emitActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [socket]);

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
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {currentUser && (
                    <span className="text-xs text-gray-500 hidden lg:inline">
                      Signed in as <span className="text-gray-300">@{currentUser.username}</span>
                    </span>
                  )}
                  {activeRoomId && (
                    <button
                      type="button"
                      onClick={() => setRightSidebarOpen((v) => !v)}
                      className={`lg:hidden p-2 rounded-lg transition-colors ${
                        rightSidebarOpen
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                      aria-label="Toggle members panel"
                      aria-expanded={rightSidebarOpen}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </button>
                  )}
                </div>
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
                socket={socket}
              />
            </>
          ) : (
            <WelcomeScreen />
          )}
        </main>

        {/* Right sidebar */}
        <RightSidebar isOpen={rightSidebarOpen} onClose={() => setRightSidebarOpen(false)} />
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
