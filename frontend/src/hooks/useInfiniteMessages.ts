import { useState, useCallback, useRef } from 'react';
import { getRoomMessages, getDialogMessages } from '../api/messages.api';
import { useChatStore } from '../store/chat.store';

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

  const prependMessages = useChatStore((s) => s.prependMessages);
  const messages = useChatStore((s) => s.messages[contextId] ?? []);

  const fetchPage = useCallback(
    async (before?: string) => {
      if (loading) return;
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
        setLoading(false);
      }
    },
    [contextId, contextType, dialogUserId, loading, prependMessages]
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
    if (!hasMore || loading) return;
    const cursor = nextCursorRef.current ?? undefined;
    fetchPage(cursor);
  }, [fetchPage, hasMore, loading]);

  return { loading, initialLoading, hasMore, loadInitial, loadOlder };
}
