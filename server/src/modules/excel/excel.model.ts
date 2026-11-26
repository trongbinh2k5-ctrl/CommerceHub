import { Schema, model } from 'mongoose';

const batchSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, required: true }, mode: { type: String, required: true }, digest: { type: String, required: true },
  status: { type: String, enum: ['INVALID', 'READY', 'COMMITTED'], required: true },
  rows: { type: [Schema.Types.Mixed], required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
batchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ExcelBatch = model('ExcelBatch', batchSchema);
const receiptSchema = new Schema({
  kind: { type: String, required: true }, mode: { type: String, required: true }, digest: { type: String, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, count: { type: Number, required: true },
}, { timestamps: true });
receiptSchema.index({ kind: 1, mode: 1, digest: 1 }, { unique: true });
export const ExcelReceipt = model('ExcelReceipt', receiptSchema);
