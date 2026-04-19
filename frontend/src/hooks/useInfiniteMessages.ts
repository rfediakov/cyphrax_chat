import { useState, useCallback, useRef } from 'react';
import { getRoomMessages, getDialogMessages } from '../api/messages.api';
import { useChatStore } from '../store/chat.store';
import type { Message } from '../store/chat.store';

// Stable fallback so the Zustand selector never returns a new [] reference
// when no messages exist yet (prevents useSyncExternalStore infinite loop).
const EMPTY_MESSAGES: Message[] = [];

interface UseInfiniteMessagesOptions {
  contextId: string;
  contextType: 'room' | 'dialog';
  /** For dialog messages we pass the other user's ID, not the dialogId */
  dialogUserId?: string;
}

export function useInfiniteMessages({
  contextId,
  contextType,
  dialogUserId,
}: UseInfiniteMessagesOptions) {
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  // Use a ref for the loading guard so fetchPage doesn't need `loading` in its deps
  const loadingRef = useRef(false);

  const prependMessages = useChatStore((s) => s.prependMessages);
  const messages = useChatStore((s) => s.messages[contextId] ?? EMPTY_MESSAGES);

  const fetchPage = useCallback(
    async (before?: string) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const params = { before, limit: 50 };
        const response =
          contextType === 'room'
            ? await getRoomMessages(contextId, params)
            : await getDialogMessages(dialogUserId ?? contextId, params);

        const { data, nextCursor } = response.data;
        // API returns newest-first; reverse for chronological display
        const ordered = [...data].reverse();

        prependMessages(contextId, ordered);
        nextCursorRef.current = nextCursor;
        setHasMore(nextCursor !== null);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [contextId, contextType, dialogUserId, prependMessages] // removed `loading` from deps
  );

  const loadInitial = useCallback(async () => {
    if (messages.length > 0) return;
    setInitialLoading(true);
    try {
      await fetchPage(undefined);
    } finally {
      setInitialLoading(false);
    }
  }, [fetchPage, messages.length]);

  const loadOlder = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    const cursor = nextCursorRef.current ?? undefined;
    void fetchPage(cursor);
  }, [fetchPage, hasMore]); // removed `loading` from deps

  return { loading, initialLoading, hasMore, loadInitial, loadOlder };
}
