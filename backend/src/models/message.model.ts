import { Schema, model, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  roomId: Types.ObjectId | null;
  dialogId: Types.ObjectId | null;
  authorId: Types.ObjectId;
  content: string;
  replyToId: Types.ObjectId | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    dialogId: { type: Schema.Types.ObjectId, ref: 'Dialog', default: null },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 3072 },
    replyToId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ dialogId: 1, createdAt: -1 });

export const Message = model<IMessage>('Message', MessageSchema);
