import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getPublicRooms, joinRoom, normalizeRoom } from '../api/rooms.api';
import { useChatStore } from '../store/chat.store';
import type { Room } from '../store/chat.store';

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

export default function PublicRooms() {
  const [query, setQuery] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const myRooms = useChatStore((s) => s.rooms);
  const setMyRooms = useChatStore((s) => s.setRooms);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myRoomIds = new Set(myRooms.map((r) => r._id));

  const fetchRooms = useCallback(async (q: string, p: number, append: boolean) => {
    setLoading(true);
    setError('');
    try {
      const res = await getPublicRooms({ q: q || undefined, page: p });
      const fetched: Room[] = (res.data.rooms ?? []).map((r) => normalizeRoom(r as unknown as Record<string, unknown>));
      const total: number = res.data.total ?? 0;
      if (append) {
        setRooms((prev) => [...prev, ...fetched]);
      } else {
        setRooms(fetched);
      }
      setHasMore(p * PAGE_SIZE < total);
    } catch {
      setError('Failed to load rooms.');
      if (!append) setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      void fetchRooms(query, 1, false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchRooms]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchRooms(query, nextPage, true);
  };

  const handleJoin = async (room: Room) => {
    setJoiningId(room._id);
    try {
      await joinRoom(room._id);
      setJoinedIds((prev) => new Set([...prev, room._id]));
      setMyRooms([...myRooms, room]); // room already normalized
    } catch {
      // Room might already be joined or another error
      setJoinedIds((prev) => new Set([...prev, room._id]));
    } finally {
      setJoiningId(null);
    }
  };

  const isJoined = (roomId: string) => myRoomIds.has(roomId) || joinedIds.has(roomId);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm">Cyphrax</span>
        </Link>
        <span className="text-gray-500 text-sm">/</span>
        <span className="text-sm text-gray-300">Public Rooms</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Public Rooms</h1>
          <p className="text-sm text-gray-400 mt-1">Discover and join open rooms.</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms by name or description…"
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Room cards */}
        <div className="space-y-3">
          {rooms.map((room) => {
            const joined = isJoined(room._id);
            return (
              <div
                key={room._id}
                className="flex items-center gap-4 px-4 py-4 bg-gray-900 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0">
                  <span className="text-blue-400 font-bold text-sm">#</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{room.name}</p>
                    {joined && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 bg-green-600/20 text-green-400 rounded font-medium">
                        Joined
                      </span>
                    )}
                  </div>
                  {room.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{room.description}</p>
                  )}
                  {room.memberCount !== undefined && (
                    <p className="text-xs text-gray-500 mt-0.5">{room.memberCount} members</p>
                  )}
                </div>
                {joined ? (
                  <Link
                    to="/"
                    onClick={() => useChatStore.getState().setActiveRoom(room._id)}
                    className="shrink-0 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 rounded-lg transition-colors"
                  >
                    View
                  </Link>
                ) : (
                  <button
                    onClick={() => handleJoin(room)}
                    disabled={joiningId === room._id}
                    className="shrink-0 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {joiningId === room._id ? 'Joining…' : 'Join'}
                  </button>
                )}
              </div>
            );
          })}
          {!loading && rooms.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">
              {query ? 'No rooms match your search.' : 'No public rooms yet.'}
            </p>
          )}
        </div>

        {/* Loading spinner */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="flex justify-center mt-6">
            <button
              onClick={handleLoadMore}
              className="px-6 py-2.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-xl transition-colors"
            >
              Load more
            </button>
          </div>
        )}

        <div className="mt-8">
          <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to chat
          </Link>
        </div>
      </main>
    </div>
  );
}
