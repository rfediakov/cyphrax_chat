import { useEffect, useState } from 'react';
import { getUsersDirectory, type DirectoryUser } from '../api/users.api';
import { usePresenceStore } from '../store/presence.store';

/**
 * Loads every other registered user for the right panel directory.
 * Seeds the presence store from the API response; socket events keep it fresh.
 */
export function useUsersDirectory(enabled = true) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const bulkSetStatuses = usePresenceStore((s) => s.bulkSetStatuses);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    getUsersDirectory()
      .then(({ data }) => {
        if (cancelled) return;
        const list = data.users ?? [];
        setUsers(list);
        const statuses: Record<string, 'online' | 'afk' | 'offline'> = {};
        for (const u of list) {
          statuses[u.id] = u.presence;
        }
        bulkSetStatuses(statuses);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, bulkSetStatuses]);

  return { users, loading, error };
}
