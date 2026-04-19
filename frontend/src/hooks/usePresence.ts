import { usePresenceStore } from '../store/presence.store';
import type { PresenceStatus } from '../components/ui/PresenceDot';

export function usePresence() {
  const statuses = usePresenceStore((s) => s.statuses);

  const getStatus = (userId: string): PresenceStatus =>
    statuses[userId] ?? 'offline';

  return { getStatus, statuses };
}
