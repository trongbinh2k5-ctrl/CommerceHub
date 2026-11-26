import { sepayConfig } from '../payments/sepay.config';
import { ghnConfig } from '../shipping/ghn.config';
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { getStoreSettings, StoreSettings } from './store.model';
import { emailAvailable, verificationRequired } from '../auth/mail.service';
import mongoose from 'mongoose';
import { recordAudit, auditChanges } from '../operations/audit.service';
export const storeRouter = Router();
storeRouter.get('/', async (_req, res) => { res.json({ success: true, data: await getStoreSettings() }); });
export const adminStoreRouter = Router();
adminStoreRouter.use(authenticate, authorize('ADMIN'));
adminStoreRouter.get('/', async (_req, res) => { res.json({ success: true, data: { ...await getStoreSettings(), integrations: { email: emailAvailable(), emailVerificationRequired: verificationRequired(), onlinePayment: !!sepayConfig(), shippingCarrier: !!ghnConfig() } } }); });
adminStoreRouter.patch('/', async (req, res) => {
  const data: Record<string, unknown> = {};
  for (const key of ['storeName', 'phone', 'email', 'address', 'hours', 'shipping', 'returns', 'warranty', 'privacy', 'terms']) {
    if (req.body?.[key] === undefined) continue;
    const value = req.body[key];
    if (typeof value !== 'string' || value.length > (['shipping','returns','warranty','privacy','terms'].includes(key) ? 12000 : 500) || (key === 'storeName' && !value.trim())) { res.status(400).json({ success: false, message: 'Nội dung cửa hàng không hợp lệ.' }); return; }
    if (key === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { res.status(400).json({ success: false, message: 'Email liên hệ không hợp lệ.' }); return; }
    data[key] = value.trim();
  }
  if (req.body?.shippingConfigured !== undefined) {
    if (typeof req.body.shippingConfigured !== 'boolean') { res.status(400).json({ message: 'Trạng thái phí không hợp lệ.' }); return; }
    data.shippingConfigured = req.body.shippingConfigured;
  }
  for (const key of ['shippingFee','freeShippingThreshold']) if (req.body?.[key] !== undefined) {
    const value = req.body[key];
    if (!(key === 'freeShippingThreshold' && value === null) && (!Number.isSafeInteger(value) || value < 0)) { res.status(400).json({ message: 'Phí giao hàng không hợp lệ.' }); return; }
    data[key] = value;
  }
  const session=await mongoose.startSession();
  let settings;
  try { settings=await session.withTransaction(async()=>{
    const before=await StoreSettings.findOne({key:'store'}).session(session);
    const updated=await StoreSettings.findOneAndUpdate({ key: 'store' }, { $set: data }, { upsert: true, returnDocument: 'after', runValidators: true, session });
    const changes=auditChanges(before,updated,Object.keys(data));
    if(changes.length)await recordAudit(req.user!.userId,'SETTINGS_UPDATED','STORE','store','Cập nhật thông tin hoặc chính sách cửa hàng.',changes,session);
    return updated;
  }); } finally { await session.endSession(); }
  res.json({ success: true, data: settings });
});
