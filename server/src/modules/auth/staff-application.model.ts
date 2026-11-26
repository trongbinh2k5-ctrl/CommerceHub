import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, maxlength: 254 },
  phone: { type: String, required: true, match: /^0\d{9}$/ },
  position: { type: String, required: true, maxlength: 100 },
  message: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', required: true },
  response: { type: String, default: '', maxlength: 500 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.index({ userId: 1, createdAt: -1, _id: -1 });
export const StaffApplication = model('StaffApplication', schema);
