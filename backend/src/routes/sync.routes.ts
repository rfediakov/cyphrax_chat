import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { AppError } from '../lib/errors.js';
import { Dialog } from '../models/dialog.model.js';
import { OfflineQueue } from '../models/offlineQueue.model.js';
import { sendRoomMessage, sendDialogMessage } from '../services/message.service.js';

interface SyncItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

const router = Router();

/**
 * POST /api/v1/sync
 * Bulk flush offline-queued actions from the client.
 * Each item is processed in order; SOS items are sorted first.
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const { items } = req.body as { items?: SyncItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'items array is required');
  }

  if (items.length > 100) {
    throw new AppError(400, 'Too many items (max 100 per request)');
  }

  // Sort: SOS first, then by createdAt ascending
  const sorted = [...items].sort((a, b) => {
    const aPriority = a.type === 'sos_trigger' ? -1 : 0;
    const bPriority = b.type === 'sos_trigger' ? -1 : 0;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.createdAt - b.createdAt;
  });

  const results: Array<{ id: string; status: 'ok' | 'error'; error?: string }> = [];

  for (const item of sorted) {
    try {
      await processItem(userId.toString(), item);

      // Record to server-side offline queue log (for audit)
      await OfflineQueue.create({
        userId,
        action: item.type,
        payload: item.payload,
        processedAt: new Date(),
      });

      results.push({ id: item.id, status: 'ok' });
    } catch (err) {
      results.push({
        id: item.id,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  res.json({ results });
});

async function processItem(userId: string, item: SyncItem): Promise<void> {
  const payload = item.payload;

  switch (item.type) {
    case 'send_message': {
      const { roomId, dialogId, content } = payload as {
        roomId?: string;
        dialogId?: string;
        content: string;
      };
      if (!content) throw new AppError(400, 'content is required');

      if (roomId) {
        // Goes through the same membership/ban checks as the REST endpoint.
        await sendRoomMessage(roomId, userId, content);
        break;
      }

      if (dialogId) {
        if (!Types.ObjectId.isValid(dialogId)) {
          throw new AppError(400, 'invalid dialogId');
        }
        const dialog = await Dialog.findById(dialogId).lean();
        if (!dialog) throw new AppError(404, 'dialog not found');

        const callerObjectId = new Types.ObjectId(userId);
        const otherParticipant = dialog.participants.find(
          (p) => !p.equals(callerObjectId),
        );
        if (!otherParticipant) {
          // The caller is not actually part of this dialog.
          throw new AppError(403, 'not a participant of this dialog');
        }
        // sendDialogMessage enforces friendship + ban rules.
        await sendDialogMessage(userId, otherParticipant.toString(), content);
        break;
      }

      throw new AppError(400, 'roomId or dialogId is required');
    }

    case 'location_update':
      // Deferred to location routes (Phase B) — log only
      break;

    case 'telemetry_update':
      // Deferred to telemetry routes (Phase C) — log only
      break;

    case 'sos_trigger':
      // Deferred to SOS routes (Phase G) — log only
      break;

    default:
      // Unknown action types are logged but not failed
      console.warn(`[Sync] Unknown action type: ${item.type}`);
  }
}

export default router;
