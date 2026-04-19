import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as messageService from '../services/message.service.js';
import { BadRequestError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';

// Mounted at /api/v1/rooms — handles room message sub-routes
const router = Router({ mergeParams: true });

// GET /api/v1/rooms/:id/messages
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const before = req.query.before as string | undefined;
    const limitRaw = parseInt((req.query.limit as string) ?? '50', 10);
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 100);

    const result = await messageService.getRoomMessages(id, req.user!._id, before, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/rooms/:id/messages
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { content, replyToId, attachmentId } = req.body as {
      content?: string;
      replyToId?: string;
      attachmentId?: string;
    };
    if (!content) {
      throw new BadRequestError('content is required');
    }
    const msg = await messageService.sendRoomMessage(id, req.user!._id, content, replyToId, attachmentId);
    res.status(201).json({ message: msg });

    getIo()?.to(`room:${id}`).emit('message', { message: msg });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/rooms/:id/messages/:msgId
router.put('/:msgId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, msgId } = req.params as { id: string; msgId: string };
    const { content } = req.body as { content?: string };
    if (!content) {
      throw new BadRequestError('content is required');
    }
    const msg = await messageService.editRoomMessage(id, req.user!._id, msgId, content);
    res.json({ message: msg });

    getIo()?.to(`room:${id}`).emit('message_edited', { message: msg });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/rooms/:id/messages/:msgId
router.delete('/:msgId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, msgId } = req.params as { id: string; msgId: string };
    await messageService.deleteRoomMessage(id, req.user!._id, msgId);
    res.json({ message: 'Message deleted' });

    getIo()?.to(`room:${id}`).emit('message_deleted', { messageId: msgId, roomId: id });
  } catch (err) {
    next(err);
  }
});

export default router;
