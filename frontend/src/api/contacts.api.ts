import api from './axios';

/** GET /contacts returns `id` (backend `toPublic`); accept `_id` if present. */
export type ContactApiRow = {
  id?: string;
  _id?: string;
  username: string;
  email: string;
};

export interface Contact {
  _id: string;
  username: string;
  email: string;
}

export function normalizeContact(raw: ContactApiRow): Contact | null {
  const _id = raw._id ?? raw.id;
  if (!_id) return null;
  return { _id, username: raw.username, email: raw.email };
}

/** Incoming pending request shape from GET /contacts/requests */
export interface PendingFriendRequest {
  id: string;
  fromUser: { id: string; username: string; email: string };
  message?: string;
  createdAt: string;
}

export const getContacts = () =>
  api.get<{ contacts: ContactApiRow[] }>('/contacts');

export const sendFriendRequest = (toUsername: string, message?: string) =>
  api.post('/contacts/request', { toUsername, message });

export const getPendingRequests = () =>
  api.get<{ requests: PendingFriendRequest[] }>('/contacts/requests');

export const respondToRequest = (
  requestId: string,
  action: 'accept' | 'reject'
) => api.put(`/contacts/requests/${requestId}`, { action });

export const removeFriend = (userId: string) =>
  api.delete(`/contacts/${userId}`);

export const banUser = (userId: string) =>
  api.post(`/contacts/ban/${userId}`);

export const unbanUser = (userId: string) =>
  api.delete(`/contacts/ban/${userId}`);
