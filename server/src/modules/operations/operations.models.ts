import { Schema, model } from 'mongoose';
import { isValidProductImage } from '../products/product-image';
const supportSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true }, productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  type: { type: String, enum: ['RETURN', 'WARRANTY'], required: true }, quantity: { type: Number, required: true, min: 1 }, reason: { type: String, required: true, maxlength: 3000 },
  images: { type: [String], default: [], validate: { validator: (v: string[]) => v.length <= 5 && v.every(x => x && isValidProductImage(x)), message: 'Invalid images' } },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'IN_PROGRESS', 'REJECTED', 'RESOLVED'], default: 'PENDING' }, open: { type: Boolean, default: true }, response: { type: String, default: '', maxlength: 3000 },
  events: { type: [{ status: String, note: String, actorId: Schema.Types.ObjectId, createdAt: { type: Date, default: Date.now } }], default: [] },
}, { timestamps: true });
supportSchema.index({ userId: 1, createdAt: -1 });
supportSchema.index({ orderId: 1, productId: 1, type: 1 }, { unique: true, partialFilterExpression: { open: true } });
export const SupportRequest = model('SupportRequest', supportSchema);
const notificationSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, title: { type: String, required: true }, message: { type: String, default: '' }, href: { type: String, required: true }, readAt: { type: Date, default: null }, dedupeKey: { type: String, required: true, unique: true } }, { timestamps: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);
const movementSchema = new Schema({ productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, actorId: { type: Schema.Types.ObjectId, ref: 'User' }, delta: { type: Number, required: true }, before: { type: Number, required: true }, after: { type: Number, required: true }, reason: { type: String, required: true, maxlength: 500 }, orderId: { type: Schema.Types.ObjectId, ref: 'Order' } }, { timestamps: true });
movementSchema.index({ productId: 1, createdAt: -1 });
export const StockMovement = model('StockMovement', movementSchema);
