import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, listItems, money, setAccessToken, restoreSession } from './api';
afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });
describe('API boundary', () => {
  it('signals mandatory password setup when the backend requires it', async () => {
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});setAccessToken('pending-staff');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'PASSWORD_CHANGE_REQUIRED',message:'Cần đổi mật khẩu'}),{status:403})));
    await expect(api('/admin/orders')).rejects.toThrow('Cần đổi mật khẩu');
    expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({type:'password-change-required'}));
  });
  it('does not redirect a new user because a previous account required a password change', async () => {
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});let respond!:(r:Response)=>void;
    vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise<Response>(resolve=>{respond=resolve;})));setAccessToken('previous-staff');
    const pending=api('/admin/orders');setAccessToken('current-user');respond(new Response('{"code":"PASSWORD_CHANGE_REQUIRED"}',{status:403}));
    await expect(pending).rejects.toBeInstanceOf(ApiError);expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it('sends credentials and preserves checkout idempotency key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{_id:'order-1'}}),{status:201})); vi.stubGlobal('fetch',fetcher); setAccessToken('test-token');
    await api('/orders','POST',{addressId:'address-1'},{'Idempotency-Key':'checkout-key-0001'});
    expect(fetcher.mock.calls[0][0]).toBe('/api/orders');
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({Authorization:'Bearer test-token','Idempotency-Key':'checkout-key-0001','Content-Type':'application/json'});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({addressId:'address-1'});
  });
  it('removes credentials from later requests after logout', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"data":[]}',{status:200})); vi.stubGlobal('fetch',fetcher); setAccessToken('old'); setAccessToken(null); await api('/products');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it('turns network errors into actionable messages', async () => { vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('network'))); await expect(api('/products')).rejects.toThrow('Không thể kết nối máy chủ'); });
  it('expires sessions on unauthorized responses', async () => { const dispatchEvent=vi.fn(); vi.stubGlobal('window',{dispatchEvent}); vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401}))); setAccessToken('expired'); await expect(api('/orders')).rejects.toBeInstanceOf(ApiError); expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type:'session-expired'})); });
  it('preserves API validation errors', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"message":"Coupon expired"}',{status:409}))); await expect(api('/orders','POST',{})).rejects.toThrow('Coupon expired'); });
  it('normalizes root-level shipping lists', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"items":[{"_id":"s1"}],"total":1}',{status:200}))); expect((await api<{items:unknown[]}>('/admin/shipping')).data.items).toEqual([{_id:'s1'}]); });
  it('normalizes shipping detail responses', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"shipment":{"_id":"s1","status":"READY"}}',{status:200}))); expect((await api('/shipping/me/orders/o1')).data).toEqual({_id:'s1',status:'READY'}); });
  it('does not expire a new login when an earlier request returns unauthorized', async () => {
    const dispatchEvent = vi.fn(); vi.stubGlobal('window', { dispatchEvent });
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(resolve => { respond = resolve; })));
    setAccessToken('previous-login'); const pending = api('/orders'); setAccessToken('current-login');
    respond(new Response('{}', { status: 401 }));
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it('does not expire a login because an anonymous request returned unauthorized', async () => {
    const dispatchEvent = vi.fn(); vi.stubGlobal('window', { dispatchEvent });
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(resolve => { respond = resolve; })));
    const pending = api('/orders'); setAccessToken('current-login'); respond(new Response('{}', { status: 401 }));
    await expect(pending).rejects.toBeInstanceOf(ApiError); expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it('preserves an explicitly empty data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":null}', { status: 200 })));
    expect((await api('/optional-resource')).data).toBeNull();
  });
  it('reports malformed success responses instead of returning invalid application data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Proxy error</html>', { status: 200 })));
    await expect(api('/products')).rejects.toThrow('Máy chủ trả về dữ liệu không hợp lệ');
  });
  it('accepts successful responses with no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect((await api('/resource', 'DELETE')).data).toBeUndefined();
  });
  it('ignores a late refresh response after a new login or logout', async () => {
    let respond!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => { respond = resolve; })).mockResolvedValueOnce(new Response('{"data":[]}',{status:200}));
    vi.stubGlobal('fetch',fetcher);
    const pending=restoreSession();setAccessToken('new-login');
    respond(new Response('{"data":{"accessToken":"old-refresh","user":{}}}',{status:200}));
    await expect(pending).rejects.toMatchObject({status:409});
    await api('/orders');expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer new-login');
  });
  it('shares concurrent refreshes so a rotating cookie is only consumed once', async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response('{"data":{"accessToken":"renewed","user":{}}}',{status:200}));vi.stubGlobal('fetch',fetcher);
    await Promise.all([restoreSession(),restoreSession(),restoreSession()]);expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].credentials).toBe('include');
  });
});
it('formats VND and normalizes both list response shapes', () => { expect(money(1000000)).toContain('1.000.000'); expect(listItems({items:[1,2]})).toEqual([1,2]); expect(listItems([3])).toEqual([3]); expect(listItems(undefined)).toEqual([]); });
