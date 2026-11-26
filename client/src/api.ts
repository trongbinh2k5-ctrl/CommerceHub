import type { Envelope } from './types';
let token: string | null = null;
let refreshEnabled = false;
let refreshing: Promise<any> | null = null;
let sessionVersion = 0;
export function enableSessionRefresh() { refreshEnabled = true; }
export async function restoreSession() {
  if (!refreshing) { const version = sessionVersion; refreshing = (async () => {
    const response = await fetch(`${(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')}/auth/refresh`, { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ApiError(response.status, 'Phiên đăng nhập đã hết hạn.');
    const payload = await response.json();
    if (version !== sessionVersion) throw new ApiError(409, 'Phiên đăng nhập đã thay đổi.');
    token = payload.data.accessToken;
    return payload.data;
  })().finally(() => { refreshing = null; }); }
  return refreshing;
}
export function setAccessToken(value: string | null) { sessionVersion++; token = value; }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function excelRequest<T = Blob>(path: string, options: { file?: File; body?: unknown; json?: boolean } = {}, retried = false): Promise<T> {
  const requestToken = token;
  const response = await fetch(`${(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')}/admin/excel${path}`, {
    method: options.file || options.body !== undefined ? 'POST' : 'GET', credentials: 'include',
    headers: { ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}), ...(options.file ? { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: options.file || (options.body !== undefined ? JSON.stringify(options.body) : undefined), signal: AbortSignal.timeout(300000),
  });
  if (response.status === 401 && requestToken && requestToken === token && refreshEnabled && !retried) {
    try { await restoreSession(); return excelRequest<T>(path, options, true); } catch { /* handled below */ }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && requestToken === token) window.dispatchEvent(new Event('session-expired'));
    if (payload?.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new Event('password-change-required'));
    throw new ApiError(response.status, payload?.message || 'Không thể xử lý file Excel. Vui lòng thử lại.');
  }
  return (options.json ? await response.json() : await response.blob()) as T;
}
export async function uploadImage(file: File): Promise<string> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5*1024*1024) throw new Error('Chỉ nhận PNG, JPEG hoặc WebP tối đa 5 MB.');
  const send=()=>fetch(`${(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')}/admin/media`,{method:'POST',credentials:'include',headers:{'Content-Type':file.type,...(token?{Authorization:`Bearer ${token}`}:{})},body:file,signal:AbortSignal.timeout(30000)});
  let response=await send();if(response.status===401&&refreshEnabled){await restoreSession();response=await send();}
  const payload=await response.json().catch(()=>null);if(!response.ok)throw new Error(payload?.message||'Không thể tải ảnh lên.');return payload.data.url;
}
export async function api<T>(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>, retried = false): Promise<Envelope<T>> {
  const requestToken = token;
  let response: Response;
  try {
    response = await fetch(`${(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')}${path}`, {
      method, credentials: 'include', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
  } catch { throw new ApiError(0, 'Không thể kết nối máy chủ. Vui lòng thử lại.'); }
  const payload = await response.json().catch(() => null);
  if (response.status === 401 && requestToken && requestToken === token && refreshEnabled && !retried && !path.startsWith('/auth/')) {
    try { await restoreSession(); return api<T>(path, method, body, headers, true); } catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; }
  }
  if (!response.ok) {
    if(response.status===403 && payload?.code==='PASSWORD_CHANGE_REQUIRED' && requestToken && requestToken===token) window.dispatchEvent(new Event('password-change-required'));
    // A late response from a previous login must not sign out the current user.
    if (response.status === 401 && requestToken && requestToken === token) window.dispatchEvent(new Event('session-expired'));
    const messages: Record<number, string> = { 401: 'Thông tin đăng nhập không đúng hoặc phiên đã hết hạn.', 429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' };
    throw new ApiError(response.status, messages[response.status] || payload?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
  }
  if (response.status === 204) return { data: undefined as T };
  if (!payload || typeof payload !== 'object') throw new ApiError(response.status, 'Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
  // Shipping uses root-level items / shipment; other modules use a data envelope.
  const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : Object.prototype.hasOwnProperty.call(payload, 'shipment') ? payload.shipment : payload;
  return { ...payload, data };
}
export const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export const date = (value: string) => new Date(value).toLocaleDateString('vi-VN');
export const statusText: Record<string, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang vận chuyển', DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy', RETURNED: 'Đã hoàn hàng', PAID: 'Đã thanh toán', VOID: 'Đã vô hiệu', READY: 'Chờ lấy hàng', PICKED_UP: 'Đã lấy hàng', IN_TRANSIT: 'Đang trung chuyển', OUT_FOR_DELIVERY: 'Đang giao', DELIVERY_FAILED: 'Giao chưa thành công', RETURNING: 'Đang hoàn', VISIBLE: 'Hiển thị', HIDDEN: 'Đã ẩn', DELETED: 'Đã xóa' };
export const listItems = <T,>(data: T[] | { items: T[] } | undefined): T[] => Array.isArray(data) ? data : data?.items || [];
