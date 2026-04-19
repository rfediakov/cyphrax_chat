import api from './axios';

export interface Contact {
  _id: string;
  username: string;
  email: string;
}

export interface FriendRequest {
  _id: string;
  fromUser: Contact;
  toUser: Contact;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export const getContacts = () =>
  api.get<{ contacts: Contact[] }>('/contacts');

export const sendFriendRequest = (toUsername: string, message?: string) =>
  api.post('/contacts/request', { toUsername, message });

export const getPendingRequests = () =>
  api.get<{ data: FriendRequest[] }>('/contacts/requests');

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
