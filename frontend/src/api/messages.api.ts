import api from './axios';
import type { Message, Dialog } from '../store/chat.store';

export interface MessagePage {
  data: Message[];
  nextCursor: string | null;
}

export interface SendMessagePayload {
  content: string;
  replyToId?: string;
  attachmentId?: string;
}

export interface EditMessagePayload {
  content: string;
}

export const getRoomMessages = (
  roomId: string,
  params?: { before?: string; limit?: number }
) => api.get<MessagePage>(`/rooms/${roomId}/messages`, { params });

export const sendRoomMessage = (roomId: string, payload: SendMessagePayload) =>
  api.post<{ message: Message }>(`/rooms/${roomId}/messages`, payload);

export const editRoomMessage = (
  roomId: string,
  msgId: string,
  payload: EditMessagePayload
) => api.put<{ message: Message }>(`/rooms/${roomId}/messages/${msgId}`, payload);

export const deleteRoomMessage = (roomId: string, msgId: string) =>
  api.delete(`/rooms/${roomId}/messages/${msgId}`);

export const getDialogs = () => api.get<{ dialogs: Dialog[] }>('/dialogs');

export const getDialogMessages = (
  userId: string,
  params?: { before?: string; limit?: number }
) => api.get<MessagePage>(`/dialogs/${userId}/messages`, { params });

export const sendDialogMessage = (
  userId: string,
  payload: SendMessagePayload
) => api.post<{ message: Message }>(`/dialogs/${userId}/messages`, payload);

export const editDialogMessage = (
  userId: string,
  msgId: string,
  payload: EditMessagePayload
) => api.put<{ message: Message }>(`/dialogs/${userId}/messages/${msgId}`, payload);

export const deleteDialogMessage = (userId: string, msgId: string) =>
  api.delete(`/dialogs/${userId}/messages/${msgId}`);
