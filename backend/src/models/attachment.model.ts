import { Schema, model, Document, Types } from 'mongoose';

export interface IAttachment extends Document {
  // TODO(agent-4): messageId is nullable during the upload-before-message flow.
  // The client uploads a file first (getting back an attachment id), then sends a
  // message referencing that id. The message creation handler links the attachment.
  messageId: Types.ObjectId | null;
  uploaderId: Types.ObjectId;
  originalName: string;
  storedPath: string;
  mimeType?: string;
  fileSize?: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true },
    storedPath: { type: String, required: true },
    mimeType: { type: String },
    fileSize: { type: Number },
    comment: { type: String, default: '' },
  },
  { timestamps: true },
);

AttachmentSchema.index({ messageId: 1 });

export const Attachment = model<IAttachment>('Attachment', AttachmentSchema);
