import api from './axios';

export interface UploadedAttachment {
  id: string;
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export const uploadAttachment = (
  file: File,
  contextId: string,
  contextType: 'room' | 'dialog'
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('contextId', contextId);
  formData.append('contextType', contextType);
  return api.post<UploadedAttachment>('/attachments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getAttachmentUrl = (id: string) => `/api/v1/attachments/${id}`;
