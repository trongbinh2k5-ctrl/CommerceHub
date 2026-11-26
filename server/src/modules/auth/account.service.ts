import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { User } from './user.model';
import { LoginSession, AccountChallenge } from './account.models';
import { generateAccessToken } from './token.service';
import { emailAvailable, sendMail, verificationRequired } from './mail.service';
import { recordAudit } from '../operations/audit.service';

const cookieName = 'ch_refresh';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
export const publicUser = (u: any) => ({ id: String(u._id), fullName: u.fullName, email: u.email, role: u.role, phone: u.phone || '', emailVerified: Boolean(u.emailVerifiedAt), mustChangePassword: Boolean(u.mustChangePassword) });
export const temporaryPasswordExpired = (u: any) => Boolean(u.mustChangePassword && u.temporaryPasswordExpiresAt && new Date(u.temporaryPasswordExpiresAt).getTime() <= Date.now());
export function validPassword(value: unknown): value is string { return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72; }
export function validEmail(value: unknown): value is string { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function readCookie(req: Request) {
  const value = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
function writeCookie(res: Response, value: string, clear = false) {
  res.cookie(cookieName, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth', maxAge: clear ? 0 : 30 * 86400000 });
}
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  const defaults = process.env.NODE_ENV === 'production' ? [] : ['http://127.0.0.1:5173','http://localhost:5173'];
  const allowed = new Set([process.env.PUBLIC_APP_URL || '', ...defaults, ...(process.env.CORS_ORIGINS || '').split(',')].map(v => v.trim().replace(/\/$/, '')).filter(Boolean));
  if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !allowed.has(req.headers.origin))) return next(Object.assign(new Error('Nguồn yêu cầu không hợp lệ.'), { statusCode: 403 }));
  next();
}
export async function startLoginSession(req: Request, res: Response, userId: string, verifiedAuthVersion: number) {
  const u = await User.findById(userId);
  if (!u || !u.isActive) return fail(401, 'Tài khoản không khả dụng.');
  if ((u.authVersion || 0) !== verifiedAuthVersion) return fail(401, 'Thông tin đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  if (temporaryPasswordExpired(u)) return fail(403, 'Mật khẩu tạm đã hết hạn. Liên hệ admin để cấp lại.');
  if (verificationRequired() && !u.emailVerifiedAt && !u.mustChangePassword) return fail(403, 'Vui lòng xác minh email trước khi đăng nhập.');
  const secret = randomBytes(32).toString('hex');
  const session = await LoginSession.create({ userId: u._id, tokenHash: digest(secret), authVersion: u.authVersion || 0, userAgent: String(req.headers['user-agent'] || '').slice(0, 180), expiresAt: u.mustChangePassword && u.temporaryPasswordExpiresAt ? u.temporaryPasswordExpiresAt : new Date(Date.now() + 30 * 86400000) });
  writeCookie(res, secret);
  return { user: publicUser(u), accessToken: generateAccessToken({ userId: u.id, role: u.role, authVersion: u.authVersion || 0, sessionId: session.id }) };
}
export async function refreshLogin(req: Request, res: Response) {
  const secret = readCookie(req);
  if (!secret) return fail(401, 'Chưa có phiên đăng nhập.');
  const old = await LoginSession.findOne({ tokenHash: digest(secret), expiresAt: { $gt: new Date() } });
  if (!old) { writeCookie(res, '', true); return fail(401, 'Phiên đăng nhập đã hết hạn.'); }
  const u = await User.findById(old.userId);
  if (!u || !u.isActive || (u.authVersion || 0) !== old.authVersion) { await old.deleteOne(); writeCookie(res, '', true); return fail(401, 'Phiên đăng nhập không còn hiệu lực.'); }
  if (temporaryPasswordExpired(u) || (verificationRequired() && !u.emailVerifiedAt && !u.mustChangePassword)) { await old.deleteOne(); writeCookie(res, '', true); return fail(401, 'Cần xác minh email hoặc cấp lại mật khẩu tạm.'); }
  const next = randomBytes(32).toString('hex');
  const updated = await LoginSession.updateOne({ _id: old._id, tokenHash: digest(secret), expiresAt: { $gt: new Date() } }, { $set: { tokenHash: digest(next), lastUsedAt: new Date() } });
  if (updated.modifiedCount !== 1) return fail(401, 'Phiên đăng nhập đã được làm mới.');
  writeCookie(res, next);
  res.json({ success: true, data: { user: publicUser(u), accessToken: generateAccessToken({ userId: u.id, role: u.role, authVersion: u.authVersion || 0, sessionId: old.id }) } });
}
export async function endLogin(req: Request, res: Response) {
  const secret = readCookie(req);
  if (secret) await LoginSession.deleteOne({ tokenHash: digest(secret) });
  writeCookie(res, '', true);
  res.json({ success: true, data: null });
}
async function issueChallenge(user: any, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'CHANGE_EMAIL', newEmail?: string) {
  if (!emailAvailable()) return fail(503, 'Dịch vụ email chưa được cấu hình. Vui lòng liên hệ cửa hàng.');
  const token = randomBytes(32).toString('hex');
  const route = purpose === 'RESET_PASSWORD' ? 'reset-password' : 'verify-email';
  const app = (process.env.PUBLIC_APP_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
  if (!/^https?:\/\//.test(app) || (process.env.NODE_ENV === 'production' && !app.startsWith('https://'))) return fail(503, 'Địa chỉ website gửi email chưa được cấu hình đúng.');
  await AccountChallenge.findOneAndUpdate({ userId: user._id, purpose }, { $set: { tokenHash: digest(token), newEmail, expiresAt: new Date(Date.now() + (purpose === 'RESET_PASSWORD' ? 30 : 60) * 60000) } }, { upsert: true, runValidators: true });
  await sendMail({ to: newEmail || user.email, subject: purpose === 'RESET_PASSWORD' ? 'Đặt lại mật khẩu BerylCore' : 'Xác minh email BerylCore', text: `${purpose === 'RESET_PASSWORD' ? 'Đặt lại mật khẩu' : 'Xác minh email'} tại ${app}/${route}?token=${token}\nLiên kết chỉ dùng một lần và hết hạn sau ${purpose === 'RESET_PASSWORD' ? '30 phút' : '60 phút'}. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.` });
}
export async function requestEmail(req: Request, res: Response, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
  if (!validEmail(req.body?.email)) return fail(400, 'Email không hợp lệ.');
  if (!emailAvailable()) return fail(503, 'Dịch vụ email chưa được cấu hình. Vui lòng liên hệ cửa hàng.');
  const u = await User.findOne({ email: req.body.email.trim().toLowerCase(), isActive: true });
  if (u && (purpose === 'RESET_PASSWORD' || !u.emailVerifiedAt)) await issueChallenge(u, purpose);
  res.status(202).json({ success: true, message: 'Nếu email phù hợp với tài khoản, liên kết hướng dẫn sẽ được gửi. Kiểm tra cả thư rác.', data: null });
}
export async function registrationVerification(userId: string) {
  const u = await User.findById(userId);
  if (!u || !emailAvailable()) return false;
  try { await issueChallenge(u, 'VERIFY_EMAIL'); return true; }
  catch { return false; }
}
export async function consumeChallenge(req: Request, res: Response, reset: boolean) {
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || (reset && !validPassword(req.body?.password))) return fail(400, 'Liên kết hoặc mật khẩu không hợp lệ.');
  const passwordHash = reset ? await bcrypt.hash(req.body.password, 12) : undefined;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const challenge = await AccountChallenge.findOneAndDelete({ tokenHash: digest(token), purpose: reset ? 'RESET_PASSWORD' : { $in: ['VERIFY_EMAIL', 'CHANGE_EMAIL'] }, expiresAt: { $gt: new Date() } }, { session });
      if (!challenge) return fail(400, 'Liên kết đã hết hạn hoặc đã được sử dụng.');
      const u = await User.findOne({ _id: challenge.userId, isActive: true }).select(reset ? '+passwordHash' : '').session(session);
      if (!u) return fail(400, 'Tài khoản không khả dụng.');
      if(reset && u.role!=='CUSTOMER' && req.body.password.length<10)return fail(400,'Mật khẩu nhân viên/quản trị cần ít nhất 10 ký tự.');
      if (reset && await bcrypt.compare(req.body.password, u.passwordHash)) return fail(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
      if (reset) { u.passwordHash = passwordHash!; u.authVersion = (u.authVersion || 0) + 1; u.mustChangePassword = false; u.temporaryPasswordExpiresAt = null; }
      else {
        if (challenge.purpose === 'CHANGE_EMAIL') { u.email = challenge.newEmail!; u.authVersion = (u.authVersion || 0) + 1; }
        u.emailVerifiedAt = new Date();
      }
      await u.save({ session });
      if (reset || challenge.purpose === 'CHANGE_EMAIL') {
        await LoginSession.deleteMany({ userId: u._id }, { session });
        await AccountChallenge.deleteMany({ userId: u._id }, { session });
      }
      if (reset && u.role !== 'CUSTOMER') await recordAudit(u._id,'PASSWORD_RESET','USER',u._id,'Chủ tài khoản đặt lại mật khẩu qua liên kết email.',[],session);
    });
    writeCookie(res, '', true);
    res.json({ success: true, message: reset ? 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.' : 'Email đã được xác minh. Vui lòng đăng nhập lại.', data: null });
  } catch (e: any) { if (e?.code === 11000) return fail(409, 'Email đã được sử dụng.'); throw e; }
  finally { await session.endSession(); }
}
export async function getProfile(req: Request, res: Response) {
  const u = await User.findById(req.user!.userId);
  if (!u) return fail(404, 'Không tìm thấy tài khoản.');
  res.json({ success: true, data: { ...publicUser(u), userId: u.id } });
}
export async function updateProfile(req: Request, res: Response) {
  const { fullName, phone } = req.body ?? {};
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 100 || (phone !== undefined && (typeof phone !== 'string' || (phone !== '' && !/^0\d{9}$/.test(phone))))) return fail(400, 'Họ tên hoặc số điện thoại không hợp lệ.');
  const u = await User.findByIdAndUpdate(req.user!.userId, { $set: { fullName: fullName.trim(), ...(phone !== undefined ? { phone } : {}) } }, { returnDocument: 'after', runValidators: true });
  if (!u) return fail(404, 'Không tìm thấy tài khoản.');
  res.json({ success: true, data: publicUser(u) });
}
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, password } = req.body ?? {};
  if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72 || !validPassword(password)) return fail(400, 'Mật khẩu không hợp lệ. Mật khẩu mới cần ít nhất 8 ký tự và không quá dài.');
  const u = await User.findById(req.user!.userId).select('+passwordHash');
  if (!u || !await bcrypt.compare(currentPassword, u.passwordHash)) return fail(400, 'Mật khẩu hiện tại không đúng.');
  if ((u.mustChangePassword || u.role!=='CUSTOMER') && password.length < 10) return fail(400,'Mật khẩu riêng cần ít nhất 10 ký tự.');
  if (await bcrypt.compare(password,u.passwordHash)) return fail(400,'Mật khẩu mới phải khác mật khẩu hiện tại.');
  const hash = await bcrypt.hash(password, 12);
  const session=await mongoose.startSession();
  try { await session.withTransaction(async()=>{
    const result = await User.updateOne({ _id: u._id, passwordHash: u.passwordHash, isActive:true, $or:[{authVersion:u.authVersion||0},...(u.authVersion?[]:[{authVersion:{$exists:false}}])] }, { $set: { passwordHash: hash, mustChangePassword:false, temporaryPasswordExpiresAt:null }, $inc: { authVersion: 1 } },{session});
    if (result.modifiedCount !== 1) return fail(409, 'Tài khoản vừa thay đổi. Vui lòng đăng nhập lại.');
    await LoginSession.deleteMany({ userId: u._id },{session});
    await AccountChallenge.deleteMany({ userId: u._id },{session});
    if(u.role!=='CUSTOMER')await recordAudit(u._id,'PASSWORD_CHANGED','USER',u._id,u.mustChangePassword?'Nhân viên hoàn tất đổi mật khẩu bắt buộc.':'Chủ tài khoản đổi mật khẩu.',[],session);
  }); } finally { await session.endSession(); }
  writeCookie(res, '', true);
  res.json({ success: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.', data: null });
}
export async function requestEmailChange(req: Request, res: Response) {
  if (!validEmail(req.body?.email) || typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password) > 72) return fail(400, 'Thông tin không hợp lệ.');
  const u = await User.findById(req.user!.userId).select('+passwordHash');
  if (!u || !await bcrypt.compare(req.body.password, u.passwordHash)) return fail(400, 'Mật khẩu hiện tại không đúng.');
  const email = req.body.email.trim().toLowerCase();
  if (email === u.email || await User.exists({ email })) return fail(409, 'Không thể sử dụng email này.');
  await issueChallenge(u, 'CHANGE_EMAIL', email);
  res.status(202).json({ success: true, message: 'Đã gửi liên kết xác nhận tới email mới. Email hiện tại chưa thay đổi.', data: null });
}
export async function listSessions(req: Request, res: Response) {
  const sessions = await LoginSession.find({ userId: req.user!.userId, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ success: true, data: sessions.map(s => ({ _id: s._id, userAgent: s.userAgent, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: String(s._id) === req.user?.sessionId })) });
}
export async function revokeSession(req: Request, res: Response) {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(400, 'Phiên không hợp lệ.');
  await LoginSession.deleteOne({ _id: req.params.id, userId: req.user!.userId });
  if (req.params.id === req.user?.sessionId) writeCookie(res, '', true);
  res.json({ success: true, data: null });
}
