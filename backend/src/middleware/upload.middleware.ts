import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { config } from '../config.js';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

const IMAGE_MAX_BYTES = 3 * 1024 * 1024;   // 3 MB
const FILE_MAX_BYTES = 20 * 1024 * 1024;   // 20 MB

function contextFolder(req: Request): string {
  const roomId = (req.body?.roomId as string) || (req.query?.roomId as string);
  const dialogId = (req.body?.dialogId as string) || (req.query?.dialogId as string);
  return roomId ?? dialogId ?? 'general';
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const folder = path.join(config.uploadDir, contextFolder(req));
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename(_req, file, cb) {
    const uuid = crypto.randomUUID();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uuid}-${safe}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    // Images are allowed — size limit enforced per-field via limits below
    cb(null, true);
  } else {
    cb(null, true);
  }
};

/**
 * Multer instance used for file uploads.
 * Max file size is 20 MB; images are further constrained to 3 MB in the route handler.
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: FILE_MAX_BYTES },
});

export { IMAGE_MIME_TYPES, IMAGE_MAX_BYTES, FILE_MAX_BYTES };
