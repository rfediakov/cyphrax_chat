import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUsersDirectory } from '../../hooks/useUsersDirectory';
import { usePresence } from '../../hooks/usePresence';
import { useLocationStore } from '../../store/location.store';
import { useChatStore } from '../../store/chat.store';
import UserAvatar from '../ui/UserAvatar';

type PresenceStatus = 'online' | 'afk' | 'offline';

function PresenceDot({ status }: { status: PresenceStatus }) {
  const colors: Record<PresenceStatus, string> = {
    online: 'bg-green-400',
    afk: 'bg-amber-400',
    offline: 'bg-gray-500',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status]}`}
      title={status}
    />
  );
}

interface AllUsersPanelProps {
  onSelectUser?: (userId: string, username: string) => void;
  compact?: boolean;
}

export function AllUsersPanel({ onSelectUser, compact }: AllUsersPanelProps) {
  const navigate = useNavigate();
  const { users, loading, error } = useUsersDirectory();
  const { getStatus } = usePresence();
  const userLocations = useLocationStore((s) => s.userLocations);
  const setActiveDialog = useChatStore((s) => s.setActiveDialog);

  const onMapCount = useMemo(
    () => users.filter((u) => userLocations[u.id]).length,
    [users, userLocations],
  );

  const handleUser = (id: string, username: string) => {
    if (onSelectUser) {
      onSelectUser(id, username);
      return;
    }
    setActiveDialog(id);
    navigate('/');
  };

  return (
    <div className={compact ? 'px-2 pb-2' : 'px-3 pb-3 border-t border-gray-700/80'}>
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          All users
        </p>
        <span className="text-[10px] text-gray-600 tabular-nums">
          {users.length}
          {onMapCount > 0 && (
            <span className="text-cyan-500/80"> · {onMapCount} on map</span>
          )}
        </span>
      </div>

      {loading && (
        <div className="flex justify-center py-3">
          <div className="w-4 h-4 border-2 border-gray-600 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <p className="text-xs text-red-400/90 px-1">Could not load users.</p>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="text-xs text-gray-500 px-1">No other users yet.</p>
      )}

      {!loading && users.length > 0 && (
        <ul className="space-y-0.5 max-h-48 sm:max-h-64 overflow-y-auto">
          {users.map((u) => {
            const status = getStatus(u.id);
            const onMap = !!userLocations[u.id];
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => handleUser(u.id, u.username)}
                  className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg text-left hover:bg-gray-800 focus:outline-none focus:bg-gray-800 focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                >
                  <UserAvatar username={u.username} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-gray-200 truncate">
                      {u.username}
                    </span>
                    {onMap && (
                      <span className="block text-[10px] text-cyan-500/80 truncate">
                        On map
                      </span>
                    )}
                  </span>
                  <PresenceDot status={status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!compact && (
        <button
          type="button"
          onClick={() => navigate('/map')}
          className="mt-2 w-full text-center text-[11px] text-cyan-400 hover:text-cyan-300 py-1"
        >
          Open common map →
        </button>
      )}
    </div>
  );
}
