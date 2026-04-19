import api from './axios';
import type { PresenceStatus } from '../components/ui/PresenceDot';

export async function fetchPresenceStatuses(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  if (userIds.length === 0) return {};
  const { data } = await api.get<{ statuses: Record<string, PresenceStatus> }>(
    '/presence',
    { params: { userIds: userIds.join(',') } }
  );
  return data.statuses;
}
