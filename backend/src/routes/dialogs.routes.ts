import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as messageService from '../services/message.service.js';
import { BadRequestError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';

const router = Router();

// GET /api/v1/dialogs
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dialogs = await messageService.getDialogs(req.user!._id);
    res.json({ dialogs });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/dialogs/:userId/messages
router.get(
  '/:userId/messages',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const before = req.query.before as string | undefined;
      const limitRaw = parseInt((req.query.limit as string) ?? '50', 10);
      const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 100);

      const result = await messageService.getDialogMessages(req.user!._id, userId, before, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/dialogs/:userId/messages
router.post(
  '/:userId/messages',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { content, replyToId, attachmentId } = req.body as {
        content?: string;
        replyToId?: string;
        attachmentId?: string;
      };
      if (!content) {
        throw new BadRequestError('content is required');
      }
      const { message, dialogId } = await messageService.sendDialogMessage(
        req.user!._id,
        userId,
        content,
        replyToId,
        attachmentId,
      );
      res.status(201).json({ message });

      getIo()?.to(`dialog:${dialogId}`).emit('message', { message });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/dialogs/:userId/messages/:msgId
router.put(
  '/:userId/messages/:msgId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, msgId } = req.params as { userId: string; msgId: string };
      const { content } = req.body as { content?: string };
      if (!content) {
        throw new BadRequestError('content is required');
      }
      const { message, dialogId } = await messageService.editDialogMessage(
        req.user!._id,
        userId,
        msgId,
        content,
      );
      res.json({ message });

      getIo()?.to(`dialog:${dialogId}`).emit('message_edited', { message });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/dialogs/:userId/messages/:msgId
router.delete(
  '/:userId/messages/:msgId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, msgId } = req.params as { userId: string; msgId: string };
      // Resolve dialogId before the delete so we can emit to the correct channel
      const dialogId = await messageService.getDialogId(req.user!._id, userId);
      await messageService.deleteDialogMessage(req.user!._id, userId, msgId);
      res.json({ message: 'Message deleted' });

      if (dialogId) {
        getIo()
          ?.to(`dialog:${dialogId}`)
          .emit('message_deleted', { messageId: msgId, dialogId });
      }
    } catch (err) {
      next(err);
    }
  },
);

export default router;
