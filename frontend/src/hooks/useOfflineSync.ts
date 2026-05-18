import { useEffect } from 'react';
import { flush, getQueueSize, getBlob, deleteBlob } from '../lib/offlineQueue';
import { useNetworkStore } from '../store/network.store';
import api from '../api/axios';
import type { QueuedAction } from '../lib/offlineQueue';

async function processAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case 'send_message': {
      const { roomId, dialogId, content, attachmentId } = action.payload as {
        roomId?: string;
        dialogId?: string;
        content: string;
        attachmentId?: string;
      };
      if (roomId) {
        await api.post(`/rooms/${roomId}/messages`, { content, attachmentId });
      } else if (dialogId) {
        await api.post(`/dialogs/${dialogId}/messages`, { content, attachmentId });
      }
      break;
    }

    case 'send_audio':
    case 'send_video': {
      const { blobKey, contextId, contextType, dialogUserId, duration, mimeType } = action.payload as {
        blobKey: string;
        thumbKey?: string;
        contextId: string;
        contextType: 'room' | 'dialog';
        dialogUserId?: string;
        duration: number;
        mimeType: string;
      };
      const blob = await getBlob(blobKey);
      if (!blob) break;

      const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
      const mediaFile = new File([blob], `recording.${ext}`, { type: mimeType });
      const formData = new FormData();
      formData.append('file', mediaFile);
      formData.append('contextId', contextId);
      formData.append('contextType', contextType);
      const uploadRes = await api.post<{ id: string }>('/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const msgType = action.type === 'send_audio' ? 'audio' : 'video';
      const targetId = contextType === 'room' ? contextId : (dialogUserId ?? contextId);
      const endpoint = contextType === 'room'
        ? `/rooms/${targetId}/messages`
        : `/dialogs/${targetId}/messages`;

      await api.post(endpoint, {
        content: ' ',
        attachmentId: uploadRes.data.id,
        type: msgType,
        duration: Math.round(duration),
      });

      await deleteBlob(blobKey);
      break;
    }

    case 'location_update':
      await api.post('/location', action.payload);
      break;

    case 'telemetry_update':
      await api.post('/telemetry', action.payload);
      break;

    case 'sos_trigger':
      await api.post('/sos', action.payload);
      break;

    case 'sos_resolve': {
      const { sosId } = action.payload as { sosId: string };
      await api.delete(`/sos/${sosId}`);
      break;
    }

    default:
      // Generic fallback: POST to /sync with the action
      await api.post('/sync', { items: [action] });
  }
}

export function useOfflineSync(): void {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const setQueueSize = useNetworkStore((s) => s.setQueueSize);

  // Update queue size badge periodically
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const size = await getQueueSize();
      setQueueSize(size);
    };
    void tick();
    const id = setInterval(() => void tick(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setQueueSize]);

  // Flush queue when coming back online
  useEffect(() => {
    if (!isOnline) return;

    const run = async () => {
      const size = await getQueueSize();
      if (size === 0) return;

      console.log(`[OfflineSync] Flushing ${size} queued actions`);
      const result = await flush(processAction);
      console.log(`[OfflineSync] Done — succeeded: ${result.succeeded}, failed: ${result.failed}`);

      const remaining = await getQueueSize();
      setQueueSize(remaining);
    };

    void run();
  }, [isOnline, setQueueSize]);
}
