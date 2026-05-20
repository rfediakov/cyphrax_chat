import api from './axios';

export type PresenceStatus = 'online' | 'afk' | 'offline';

export interface DirectoryUser {
  id: string;
  username: string;
  presence: PresenceStatus;
}

export const getUsersDirectory = () =>
  api.get<{ users: DirectoryUser[] }>('/users/directory');
