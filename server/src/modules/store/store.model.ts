import { Schema, model } from 'mongoose';
const schema = new Schema({
  key: { type: String, unique: true, default: 'store' },
  storeName: { type: String, default: 'BerylCore' },
  phone: { type: String, default: '' }, email: { type: String, default: '' }, address: { type: String, default: '' }, hours: { type: String, default: '' },
  shipping: { type: String, default: '' }, returns: { type: String, default: '' }, warranty: { type: String, default: '' }, privacy: { type: String, default: '' }, terms: { type: String, default: '' },
  shippingConfigured: { type: Boolean, default: false }, shippingFee: { type: Number, min: 0, default: 0 }, freeShippingThreshold: { type: Number, min: 0, default: null },
}, { timestamps: true });
export const StoreSettings = model('StoreSettings', schema);
export async function getStoreSettings() { return await StoreSettings.findOne({ key: 'store' }).lean() || { storeName: 'BerylCore', phone: '', email: '', address: '', hours: '', shipping: '', returns: '', warranty: '', privacy: '', terms: '', shippingConfigured: false, shippingFee: 0, freeShippingThreshold: null }; }
export function shippingAmount(totalAfterDiscount: number, settings: { shippingConfigured: boolean; shippingFee: number; freeShippingThreshold?: number | null }) { return settings.shippingConfigured && (settings.freeShippingThreshold == null || totalAfterDiscount < settings.freeShippingThreshold) ? settings.shippingFee : 0; }
