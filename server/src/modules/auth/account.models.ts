import { Schema, model } from 'mongoose';

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  authVersion: { type: Number, required: true },
  userAgent: { type: String, default: '' },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LoginSession = model('LoginSession', sessionSchema);

const challengeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, enum: ['VERIFY_EMAIL', 'RESET_PASSWORD', 'CHANGE_EMAIL'], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  newEmail: String,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
challengeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AccountChallenge = model('AccountChallenge', challengeSchema);
