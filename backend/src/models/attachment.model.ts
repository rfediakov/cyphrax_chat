import { Schema, model, Document, Types } from 'mongoose';

export interface IAttachment extends Document {
  messageId: Types.ObjectId;
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
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
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
