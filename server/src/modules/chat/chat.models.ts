import { Schema, model } from 'mongoose';

const conversationSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['STORE', 'BOT'], required: true },
  open: { type: Boolean, default: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  seq: { type: Number, default: 0 },
  customerReadSeq: { type: Number, default: 0 },
  staffReadSeq: { type: Number, default: 0 },
  lastCustomerSeq: { type: Number, default: 0 },
  lastStoreSeq: { type: Number, default: 0 },
  preview: { type: String, default: '', maxlength: 160 },
}, { timestamps: true });
conversationSchema.index({ customerId: 1, kind: 1 }, { unique: true, partialFilterExpression: { open: true } });
conversationSchema.index({ kind: 1, open: 1, updatedAt: -1 });
export const Conversation = model('ChatConversation', conversationSchema);

const cardSchema = new Schema({
  productId: String, name: String, imageUrl: String, price: Number, stock: Number,
}, { _id: false });
const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'ChatConversation', required: true },
  seq: { type: Number, required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  senderRole: { type: String, enum: ['CUSTOMER', 'STAFF', 'ADMIN', 'BOT'], required: true },
  text: { type: String, required: true, maxlength: 4000 },
  clientId: { type: String, required: true },
  cards: { type: [cardSchema], default: [] },
}, { timestamps: true });
messageSchema.index({ conversationId: 1, seq: 1 }, { unique: true });
messageSchema.index({ conversationId: 1, senderId: 1, clientId: 1 }, { unique: true });
export const ChatMessage = model('ChatMessage', messageSchema);
