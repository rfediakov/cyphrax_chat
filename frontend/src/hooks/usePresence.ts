import { usePresenceStore } from '../store/presence.store';

type PresenceStatus = 'online' | 'afk' | 'offline';

export function usePresence() {
  const statuses = usePresenceStore((s) => s.statuses);

  const getStatus = (userId: string): PresenceStatus =>
    statuses[userId] ?? 'offline';

  return { getStatus, statuses };
}
