import path from 'path';
import fs from 'fs/promises';
import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { upload, IMAGE_MIME_TYPES, IMAGE_MAX_BYTES } from '../middleware/upload.middleware.js';
import { Attachment } from '../models/attachment.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { Dialog } from '../models/dialog.model.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';

const router = Router();

// POST /api/v1/attachments/upload
router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new BadRequestError('No file uploaded');
      }

      const file = req.file;

      // Enforce image size limit (images ≤ 3 MB, others ≤ 20 MB handled by multer)
      if (IMAGE_MIME_TYPES.has(file.mimetype) && file.size > IMAGE_MAX_BYTES) {
        await fs.unlink(file.path).catch(() => undefined);
        res.status(413).json({ error: 'Image exceeds 3 MB limit' });
        return;
      }

      const attachment = await Attachment.create({
        messageId: null,
        uploaderId: new Types.ObjectId(req.user!._id),
        originalName: file.originalname,
        storedPath: file.path,
        mimeType: file.mimetype,
        fileSize: file.size,
      });

      res.status(201).json({
        id: String(attachment._id),
        url: `/api/v1/attachments/${attachment._id}`,
      });
    } catch (err) {
      // Clean up uploaded file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => undefined);
      }
      next(err);
    }
  },
);

// GET /api/v1/attachments/:id  — auth-gated download (§8 membership check)
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attachment = await Attachment.findById(req.params.id).lean();
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    const userId = new Types.ObjectId(req.user!._id);
    let authorized = false;

    // Determine context from the linked message's roomId / dialogId
    if (attachment.messageId) {
      const { Message } = await import('../models/message.model.js');
      const message = await Message.findById(attachment.messageId).lean();

      if (message?.roomId) {
        const member = await RoomMember.findOne({ roomId: message.roomId, userId }).lean();
        authorized = !!member;
      } else if (message?.dialogId) {
        const dialog = await Dialog.findOne({ _id: message.dialogId, participants: userId }).lean();
        authorized = !!dialog;
      }
    } else {
      // Orphaned attachment (not yet linked to a message): only the uploader may access it
      authorized = attachment.uploaderId.toString() === req.user!._id;
    }

    if (!authorized) {
      throw new ForbiddenError('Access denied');
    }

    res.sendFile(path.resolve(attachment.storedPath));
  } catch (err) {
    next(err);
  }
});

export default router;
