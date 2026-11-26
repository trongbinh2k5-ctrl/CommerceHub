import { createHmac, timingSafeEqual } from 'node:crypto';

export const sandboxUrl = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
export function vnpayConfig() {
  const tmnCode = process.env.VNPAY_TMN_CODE?.trim();
  const secret = process.env.VNPAY_HASH_SECRET?.trim();
  const returnUrl = process.env.VNPAY_RETURN_URL?.trim();
  if (process.env.VNPAY_ENABLED !== 'true' || !tmnCode || !secret || !returnUrl) return null;
  try { const url = new URL(returnUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null; } catch { return null; }
  return { tmnCode, secret, returnUrl };
}
// VNPAY 2.1.0: sort keys then form-encode values (spaces become '+').
export function canonicalVnpay(params: Record<string, string>) {
  return Object.keys(params).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`).join('&');
}
export function signVnpay(params: Record<string, string>, secret: string) {
  return createHmac('sha512', secret).update(canonicalVnpay(params), 'utf8').digest('hex');
}
export function verifyVnpay(query: unknown, secret: string): Record<string,string> | null {
  if (!query || typeof query !== 'object') return null;
  const params: Record<string,string> = {};
  for (const [key,value] of Object.entries(query)) {
    if (typeof value !== 'string' || value.length > 2048 || !/^vnp_[A-Za-z0-9]+$/.test(key)) return null;
    if (!['vnp_SecureHash','vnp_SecureHashType'].includes(key)) params[key] = value;
  }
  const hash = (query as Record<string,string>).vnp_SecureHash;
  if (!hash || !/^[a-fA-F0-9]{128}$/.test(hash)) return null;
  return timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(signVnpay(params,secret),'hex')) ? params : null;
}
export function vnpayDate(date: Date) {
  return new Date(date.getTime() + 7*60*60*1000).toISOString().slice(0,19).replace(/[-T:]/g,'');
}
