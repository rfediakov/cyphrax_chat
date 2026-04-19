import api from './axios';

export interface Contact {
  _id: string;
  username: string;
  email: string;
}

/** Incoming pending request shape from GET /contacts/requests */
export interface PendingFriendRequest {
  id: string;
  fromUser: { id: string; username: string; email: string };
  message?: string;
  createdAt: string;
}

export const getContacts = () =>
  api.get<{ contacts: Contact[] }>('/contacts');

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
