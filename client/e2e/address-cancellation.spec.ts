import {test,expect,request} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('address suggestions reject a mismatched ward; confirmed order can be cancelled before handover',async({page})=>{
 const email='qa-address-'+Date.now()+'@test.local';expect((await page.request.post('/api/auth/register',{data:{fullName:'QA Address',email,password:'DemoCommerce!2026'}})).status()).toBe(201);
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
 await page.goto('/account?tab=addresses');await page.getByRole('button',{name:'Thêm địa chỉ',exact:true}).click();
 await page.getByLabel('Người nhận',{exact:true}).fill('Người nhận kiểm thử');await page.getByLabel('Số điện thoại',{exact:true}).fill('0901234567');
 await page.getByLabel('Tỉnh / Thành phố',{exact:true}).fill('Hà Nội');await page.getByLabel('Phường / Xã',{exact:true}).fill('Phường Sài Gòn');await page.getByLabel('Số nhà, đường, địa chỉ chi tiết',{exact:true}).fill('123 Đường kiểm thử');
 await page.getByRole('button',{name:'Lưu địa chỉ',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Phường/xã chưa hợp lệ');
 await page.getByLabel('Tỉnh / Thành phố',{exact:true}).fill('Hồ Chí Minh');await expect(page.locator('#delivery-wards option[value="Phường Sài Gòn"]')).toHaveCount(1);await page.getByLabel('Phường / Xã',{exact:true}).fill('Phường Sài Gòn');
 await page.getByRole('button',{name:'Lưu địa chỉ',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const context=await request.newContext({baseURL:'http://127.0.0.1:5001'});
 try{
  const login=async(role:string)=>(await (await context.post('/api/auth/login',{data:{email:role==='customer'?email:role+'@demo.local',password:'DemoCommerce!2026'}})).json()).data.accessToken;
  const customer=await login('customer'),admin=await login('admin'),headers={Authorization:'Bearer '+customer};
  const addresses=(await (await context.get('/api/addresses',{headers})).json()).data;
  const products=(await (await context.get('/api/products?limit=50')).json()).data;
  const product=products.find((p:any)=>p.price>0&&p.stock>2);expect(product).toBeTruthy();
  expect((await context.post('/api/cart/items',{headers,data:{productId:product._id,quantity:1}})).ok()).toBe(true);
  const response=await context.post('/api/orders',{headers:{...headers,'Idempotency-Key':randomUUID()},data:{addressId:addresses[0]._id,paymentMethod:'COD'}});expect(response.ok()).toBe(true);
  const order=(await response.json()).data;
  expect((await context.patch('/api/admin/orders/'+order._id+'/status',{headers:{Authorization:'Bearer '+admin},data:{status:'CONFIRMED'}})).ok()).toBe(true);
  await page.goto('/orders/'+order._id);await page.getByRole('button',{name:'Hủy đơn hàng',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('chưa tự hoàn');await page.getByRole('button',{name:'Xác nhận hủy',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.page-heading .badge')).toHaveText('Đã hủy');await expect(page.locator('.summary .badge')).toHaveText('Đã hủy');
  await page.goto('/account?tab=orders');await expect(page.getByRole('navigation',{name:'Trạng thái đơn hàng'})).toBeVisible();await page.getByRole('button',{name:'Đã hủy',exact:true}).click();
  await page.getByLabel('Tìm đơn hàng',{exact:true}).fill(order._id.slice(-8));await expect(page.locator('.order-card')).toHaveCount(1);
  await expect(page.locator('.chat-prompt-pill')).toHaveCount(0);
  await page.setViewportSize({width:390,height:850});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/full-audit-2026-11-24/orders-390.png',fullPage:true});
  await page.getByRole('button',{name:'Mua lại',exact:true}).click();await expect(page).toHaveURL(/\/cart$/);await expect(page.locator('.cart-row')).toBeVisible();
 }finally{await context.dispose();}
});
