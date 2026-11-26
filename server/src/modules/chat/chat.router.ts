import { Router, type Request } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../../middlewares/auth.middleware';
import { createRequestLimiter } from '../../middlewares/security.middleware';
import { Conversation, ChatMessage } from './chat.models';
import { scriptedAssistant, publicChatProduct } from './chat.provider';
import { User } from '../auth/user.model';

const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
const id = (value: unknown) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const textOf = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) return fail(400, 'Tin nhắn cần có từ 1 đến 2000 ký tự.');
  return value.trim();
};
const productOf = (value: unknown): string | undefined => { if (value === undefined || value === '') return undefined; if (!id(value)) return fail(400, 'Mã sản phẩm không hợp lệ.'); return String(value); };
const pageOf = (value: unknown) => { const p = value === undefined ? 1 : Number(value); if (!Number.isSafeInteger(p) || p < 1 || p > 10000) return fail(400, 'Trang không hợp lệ.'); return p; };
const accessFilter = (req: Request): Record<string, unknown> => req.user!.role === 'CUSTOMER' ? { customerId: req.user!.userId } : req.user!.role === 'ADMIN' ? { kind: 'STORE' } : { kind: 'STORE', $or: [{ assignedTo: null }, { assignedTo: req.user!.userId }] };
async function accessible(req: Request) {
  if (!id(req.params.id)) return fail(400, 'Mã hội thoại không hợp lệ.');
  const c = await Conversation.findOne({ _id: req.params.id, ...accessFilter(req) }).lean();
  if (!c) return fail(404, 'Không tìm thấy hội thoại hoặc bạn không có quyền truy cập.');
  return c;
}
const summary = (c: any, customer: boolean) => ({ ...c, unread: customer ? c.lastStoreSeq > c.customerReadSeq : c.lastCustomerSeq > c.staffReadSeq, status: !c.open ? 'CLOSED' : c.assignedTo ? 'ACTIVE' : 'WAITING' });

export const chatRouter = Router();
// Guest demo is stateless. Signed-in history uses the authenticated message endpoint.
chatRouter.post('/assistant', createRequestLimiter(15, 60_000), async (req, res) => {
  const text = textOf(req.body?.text), productId = productOf(req.body?.productId);
  const questions = req.body?.recentQuestions;
  if (questions !== undefined && (!Array.isArray(questions) || questions.length > 3 || questions.some(q => typeof q !== 'string' || q.length > 2000))) return fail(400, 'Ngữ cảnh hội thoại không hợp lệ.');
  res.json({ success: true, data: await scriptedAssistant.reply(text, productId, { recentQuestions: questions || [] }) });
});
chatRouter.use(authenticate);
chatRouter.get('/staff', async (req, res) => {
  if (req.user!.role !== 'ADMIN') return fail(403, 'Chỉ admin được phân công nhân viên.');
  res.json({ success: true, data: await User.find({ role: { $in: ['STAFF', 'ADMIN'] }, isActive: true, mustChangePassword: { $ne: true } }).select('fullName role').limit(200).lean() });
});
chatRouter.get('/conversations', async (req, res) => {
  const page = pageOf(req.query.page), filter = accessFilter(req);
  if (req.query.status !== undefined) {
    if (!['WAITING', 'ACTIVE', 'CLOSED'].includes(String(req.query.status))) return fail(400, 'Trạng thái không hợp lệ.');
    Object.assign(filter, req.query.status === 'CLOSED' ? { open: false } : { open: true, assignedTo: req.query.status === 'WAITING' ? null : { $ne: null } });
    // Keep staff ownership predicate even when a status filter is applied.
  }
  const customer = req.user!.role === 'CUSTOMER';
  const [items, total] = await Promise.all([Conversation.find(filter).populate('customerId', 'fullName').populate('assignedTo', 'fullName').sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * 30).limit(30).lean(), Conversation.countDocuments(filter)]);
  res.json({ success: true, data: items.map(c => summary(c, customer)), pagination: { page, total, totalPages: Math.ceil(total / 30) } });
});
chatRouter.get('/unread', async (req, res) => {
  const customer = req.user!.role === 'CUSTOMER';
  const count = await Conversation.countDocuments({ ...accessFilter(req), $expr: { $gt: customer ? ['$lastStoreSeq', '$customerReadSeq'] : ['$lastCustomerSeq', '$staffReadSeq'] } });
  res.json({ success: true, data: { count } });
});
chatRouter.post('/conversations', createRequestLimiter(20, 60_000), async (req, res) => {
  if (req.user!.role !== 'CUSTOMER') return fail(403, 'Chỉ khách hàng được tạo hội thoại.');
  const kind = req.body?.kind;
  if (!['STORE', 'BOT'].includes(kind)) return fail(400, 'Loại hội thoại không hợp lệ.');
  const filter = { customerId: req.user!.userId, kind, open: true };
  let data;
  try { data = await Conversation.findOneAndUpdate(filter, { $setOnInsert: filter }, { upsert: true, returnDocument: 'after', runValidators: true }); }
  catch (e: any) { if (e.code !== 11000) throw e; data = await Conversation.findOne(filter); }
  res.json({ success: true, data });
});
chatRouter.get('/conversations/:id/messages', async (req, res) => {
  const c = await accessible(req);
  const before = req.query.before === undefined ? c.seq + 1 : Number(req.query.before);
  if (!Number.isSafeInteger(before) || before < 1) return fail(400, 'Mốc tin nhắn không hợp lệ.');
  const messages = await ChatMessage.find({ conversationId: c._id, seq: { $lt: before } }).sort({ seq: -1 }).limit(51).lean();
  const hasMore = messages.length > 50;
  res.json({ success: true, data: { conversation: summary(c, req.user!.role === 'CUSTOMER'), messages: messages.slice(0, 50).reverse(), hasMore } });
});
chatRouter.patch('/conversations/:id/read', async (req, res) => {
  const c = await accessible(req), seq = req.body?.seq;
  if (!Number.isSafeInteger(seq) || seq < 0 || seq > c.seq) return fail(400, 'Mốc đã đọc không hợp lệ.');
  const customer = req.user!.role === 'CUSTOMER';
  if (!customer && String(c.assignedTo) !== req.user!.userId) return fail(409, 'Nhận hội thoại trước khi đánh dấu đã đọc.');
  await Conversation.updateOne({ _id: c._id, ...(customer ? { customerId: req.user!.userId } : { assignedTo: req.user!.userId }) }, { $max: { [customer ? 'customerReadSeq' : 'staffReadSeq']: seq } }, { timestamps: false });
  res.json({ success: true, data: null });
});
chatRouter.patch('/conversations/:id', async (req, res) => {
  const c = await accessible(req), action = req.body?.action, me = req.user!;
  if (action === 'claim') {
    if (me.role === 'CUSTOMER' || c.kind !== 'STORE') return fail(403, 'Không có quyền tiếp nhận.');
    const updated = await Conversation.findOneAndUpdate({ _id: c._id, open: true, assignedTo: null }, { $set: { assignedTo: me.userId } }, { returnDocument: 'after' });
    if (!updated) return fail(409, 'Hội thoại đã được tiếp nhận hoặc đã đóng.');
  } else if (action === 'assign') {
    if (me.role !== 'ADMIN') return fail(403, 'Chỉ admin được chuyển nhân viên.');
    if (!id(req.body?.assignedTo) || !await User.exists({ _id: req.body.assignedTo, isActive: true, role: { $in: ['STAFF', 'ADMIN'] }, mustChangePassword: { $ne: true } })) return fail(400, 'Nhân viên không khả dụng.');
    if (!await Conversation.findOneAndUpdate({ _id: c._id, open: true }, { $set: { assignedTo: req.body.assignedTo, staffReadSeq: 0 } })) return fail(409, 'Hội thoại đã đóng.');
  } else if (action === 'close' || action === 'reopen') {
    if (me.role !== 'CUSTOMER' && me.role !== 'ADMIN' && String(c.assignedTo) !== me.userId) return fail(403, 'Chỉ người phụ trách được thay đổi hội thoại.');
    if (action === 'reopen' && me.role !== 'ADMIN') return fail(403, 'Chỉ admin được mở lại hội thoại cũ. Bạn có thể tạo cuộc trò chuyện mới.');
    try {
      const result = await Conversation.updateOne({ _id: c._id, ...(me.role === 'STAFF' ? { assignedTo: me.userId } : {}) }, { $set: { open: action === 'reopen' } });
      if (!result.matchedCount) return fail(409, 'Hội thoại đã được chuyển cho người khác.');
    }
    catch (e: any) { if (e.code === 11000) return fail(409, 'Khách đã có hội thoại đang mở.'); throw e; }
  } else return fail(400, 'Thao tác không hợp lệ.');
  res.json({ success: true, data: null });
});
chatRouter.post('/conversations/:id/messages', createRequestLimiter(30, 60_000), async (req, res) => {
  const c = await accessible(req), me = req.user!, text = textOf(req.body?.text), clientId = req.body?.clientId, productId = productOf(req.body?.productId);
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(clientId)) return fail(400, 'Mã tin nhắn không hợp lệ.');
  if (me.role !== 'CUSTOMER' && String(c.assignedTo) !== me.userId) return fail(409, 'Bạn cần tiếp nhận hội thoại để trả lời.');
  const old = await ChatMessage.findOne({ conversationId: c._id, senderId: me.userId, clientId });
  if (old) { if (old.text !== text) return fail(409, 'Mã gửi lại không khớp nội dung.'); res.json({ success: true, data: old }); return; }
  if (!c.open) return fail(409, 'Hội thoại đã đóng.');
  const product = productId ? await publicChatProduct(productId) : null;
  if (productId && !product) return fail(400, 'Sản phẩm không còn khả dụng.');
  // Derive signed-in context from this customer's own conversation, never from client-supplied history.
  const history = c.kind === 'BOT' ? await ChatMessage.find({ conversationId: c._id, senderRole: 'CUSTOMER' }).sort({ seq: -1 }).limit(3).select('text').lean() : [];
  const result = c.kind === 'BOT' ? await scriptedAssistant.reply(text, productId, { recentQuestions: history.reverse().map(m => m.text) }) : null;
  const reply = result ? { ...result, text: result.text.length > 4000 ? result.text.slice(0, 3999) + '…' : result.text } : null;
  const session = await mongoose.startSession();
  let data;
  try {
    await session.withTransaction(async () => {
      const existing = await ChatMessage.findOne({ conversationId: c._id, senderId: me.userId, clientId }).session(session);
      if (existing) { if (existing.text !== text) return fail(409, 'Mã gửi lại không khớp nội dung.'); data = existing; return; }
      const guard = { _id: c._id, open: true, ...(me.role === 'CUSTOMER' ? { customerId: me.userId } : { assignedTo: me.userId }) };
      const updated = await Conversation.findOneAndUpdate(guard, { $inc: { seq: reply ? 2 : 1 }, $set: { preview: (reply?.text || text).slice(0, 160) } }, { returnDocument: 'after', session });
      if (!updated) return fail(409, 'Hội thoại đã đóng hoặc được chuyển cho người khác.');
      const seq = updated.seq - (reply ? 1 : 0);
      const cards = product ? [{ productId: String(product._id), name: product.name, imageUrl: product.imageUrl, price: product.price, stock: product.stock }] : [];
      [data] = await ChatMessage.create([{ conversationId: c._id, seq, senderId: me.userId, senderRole: me.role, text, clientId, cards }], { session });
      if (reply) await ChatMessage.create([{ conversationId: c._id, seq: seq + 1, senderRole: 'BOT', text: reply.text, cards: reply.cards || [], clientId: 'bot-' + clientId }], { session });
      await Conversation.updateOne({ _id: c._id }, { $set: me.role === 'CUSTOMER' ? { lastCustomerSeq: seq, ...(reply ? { lastStoreSeq: seq + 1 } : {}) } : { lastStoreSeq: seq } }, { session });
    });
  } catch (e: any) {
    if (e.code !== 11000) throw e;
    data = await ChatMessage.findOne({ conversationId: c._id, senderId: me.userId, clientId });
    if (!data || data.text !== text) return fail(409, 'Tin nhắn bị trùng. Hãy tải lại lịch sử.');
  } finally { await session.endSession(); }
  res.json({ success: true, data });
});
