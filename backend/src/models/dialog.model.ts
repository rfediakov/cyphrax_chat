import { Schema, model, Document, Types } from 'mongoose';

export interface IDialog extends Document {
  participants: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const DialogSchema = new Schema<IDialog>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      validate: {
        validator: (v: unknown[]) => v.length === 2,
        message: 'A dialog must have exactly 2 participants',
      },
    },
  },
  { timestamps: true },
);

// Participants are always sorted before save to guarantee uniqueness
DialogSchema.pre('save', function (next) {
  this.participants = this.participants.sort((a, b) => a.toString().localeCompare(b.toString()));
  next();
});

DialogSchema.index({ participants: 1 }, { unique: true });

export const Dialog = model<IDialog>('Dialog', DialogSchema);
