import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { createRequestLimiter } from '../../middlewares/security.middleware';
import { User } from './user.model';
import { StaffApplication } from './staff-application.model';
import { LoginSession, AccountChallenge } from './account.models';
import { auditChanges, recordAudit } from '../operations/audit.service';
import { Notification } from '../operations/operations.models';

const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
const statuses = ['PENDING', 'APPROVED', 'REJECTED'];
function pageNumber(value: unknown) {
  const page = Number(value ?? 1);
  if ((value !== undefined && typeof value !== 'string') || !Number.isSafeInteger(page) || page < 1 || page > 1000000) return fail(400, 'Trang không hợp lệ.');
  return page;
}

export const staffApplicationRouter = Router();
staffApplicationRouter.use(authenticate, authorize('CUSTOMER'));
staffApplicationRouter.get('/', async (req, res) => {
  const page = pageNumber(req.query.page), filter = { userId: req.user!.userId };
  const [data, total] = await Promise.all([
    StaffApplication.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 10).limit(10).lean(),
    StaffApplication.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page, total, totalPages: Math.ceil(total / 10) } });
});
staffApplicationRouter.post('/', createRequestLimiter(5, 15 * 60000), async (req, res) => {
  const b = req.body ?? {};
  if (Object.keys(b).some(key => !['phone', 'position', 'message'].includes(key)) ||
      typeof b.phone !== 'string' || !/^0\d{9}$/.test(b.phone) ||
      typeof b.position !== 'string' || !b.position.trim() || b.position.length > 100 ||
      typeof b.message !== 'string' || b.message.trim().length < 20 || b.message.length > 2000) return fail(400, 'Nhập số điện thoại 10 chữ số, vị trí mong muốn và giới thiệu từ 20 đến 2.000 ký tự.');
  const session = await mongoose.startSession();
  try {
    const application = await session.withTransaction(async () => {
      // Write the applicant document so role/lock changes conflict with submission.
      const user = await User.findOneAndUpdate({ _id: req.user!.userId, role: 'CUSTOMER', isActive: true }, { $set: { updatedAt: new Date() } }, { returnDocument: 'after', session });
      if (!user) return fail(409, 'Chỉ tài khoản khách hàng đang hoạt động được gửi đăng ký.');
      const [item] = await StaffApplication.create([{ userId: user._id, fullName: user.fullName, email: user.email, phone: b.phone, position: b.position.trim(), message: b.message.trim() }], { session });
      await recordAudit(user._id, 'STAFF_APPLICATION_SUBMITTED', 'STAFF_APPLICATION', item!._id, 'Khách hàng gửi đăng ký làm nhân viên.', [], session);
      return item!;
    });
    res.status(201).json({ success: true, data: application });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, 'Bạn đã có một đăng ký đang chờ duyệt.');
    throw e;
  } finally { await session.endSession(); }
});

export const adminStaffApplicationRouter = Router();
adminStaffApplicationRouter.use(authenticate, authorize('ADMIN'));
adminStaffApplicationRouter.get('/', async (req, res) => {
  const page = pageNumber(req.query.page), status = req.query.status;
  if (status !== undefined && (typeof status !== 'string' || !statuses.includes(status))) return fail(400, 'Trạng thái không hợp lệ.');
  const filter: Record<string, unknown> = status ? { status } : {};
  const [data, total] = await Promise.all([
    StaffApplication.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 10).limit(10).lean(),
    StaffApplication.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page, total, totalPages: Math.ceil(total / 10) } });
});
adminStaffApplicationRouter.patch('/:id', async (req, res) => {
  const b = req.body ?? {};
  if (!mongoose.isValidObjectId(req.params.id) || !['APPROVED', 'REJECTED'].includes(b.status) ||
      Object.keys(b).some(key => !['status', 'response'].includes(key)) ||
      (b.response !== undefined && (typeof b.response !== 'string' || b.response.length > 500)) ||
      (b.status === 'REJECTED' && (typeof b.response !== 'string' || b.response.trim().length < 10))) return fail(400, 'Chọn duyệt hoặc từ chối. Khi từ chối, nhập lý do từ 10 đến 500 ký tự.');
  const session = await mongoose.startSession();
  try {
    const application = await session.withTransaction(async () => {
      const admin = await User.findOne({ _id: req.user!.userId, role: 'ADMIN', isActive: true }).session(session);
      if (!admin) return fail(403, 'Phiên quản trị không còn hợp lệ.');
      const item = await StaffApplication.findOneAndUpdate({ _id: req.params.id, status: 'PENDING' }, { $set: { status: b.status, response: (b.response || '').trim(), reviewedBy: admin._id, reviewedAt: new Date() } }, { returnDocument: 'after', session, runValidators: true });
      if (!item) return fail(409, 'Đăng ký không tồn tại hoặc đã được xử lý.');
      if (b.status === 'APPROVED') {
        const before = await User.findOneAndUpdate({ _id: item.userId, role: 'CUSTOMER', isActive: true }, { $set: { role: 'STAFF', mustChangePassword: true, temporaryPasswordExpiresAt: null }, $inc: { authVersion: 1 } }, { returnDocument: 'before', session, runValidators: true });
        if (!before) return fail(409, 'Tài khoản đã đổi quyền hoặc bị khóa. Không thể duyệt đăng ký này.');
        await LoginSession.deleteMany({ userId: item.userId }, { session });
        await AccountChallenge.deleteMany({ userId: item.userId }, { session });
        await recordAudit(admin._id, 'ACCOUNT_UPDATED', 'USER', item.userId, 'Duyệt đăng ký làm nhân viên; yêu cầu đổi mật khẩu.', auditChanges(before, { role: 'STAFF', mustChangePassword: true }, ['role', 'mustChangePassword']), session);
      }
      await recordAudit(admin._id, 'STAFF_APPLICATION_REVIEWED', 'STAFF_APPLICATION', item._id, b.status === 'APPROVED' ? 'Đã duyệt đăng ký làm nhân viên.' : 'Đã từ chối đăng ký làm nhân viên.', [{ field: 'status', before: 'PENDING', after: b.status }], session);
      await Notification.create([{ userId: item.userId, title: b.status === 'APPROVED' ? 'Đăng ký nhân viên đã được duyệt' : 'Kết quả đăng ký làm nhân viên', message: b.status === 'APPROVED' ? 'Đăng nhập lại bằng tài khoản hiện tại và đổi mật khẩu để bắt đầu làm việc.' : item.response, href: b.status === 'APPROVED' ? '/account' : '/account?tab=staff-application', dedupeKey: `staff-application:${item.id}:reviewed` }], { session });
      return item;
    });
    res.json({ success: true, data: application });
  } finally { await session.endSession(); }
});
