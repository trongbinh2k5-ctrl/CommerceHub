import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

async function signIn(page:Page,email:string,password='DemoCommerce!2026') {
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
async function auth(request:APIRequestContext,email:string,password='DemoCommerce!2026') {
  const r=await request.post('/api/auth/login',{data:{email,password}});expect(r.status()).toBe(200);return (await r.json()).data.accessToken as string;
}
const noOverflow=async(page:Page)=>expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

test('recovery and policies explain unconfigured services; new public pages fit phones',async({page})=>{
  for(const width of [1280,390,320]) {
    await page.setViewportSize({width,height:850});
    for(const route of ['/forgot-password','/verify-email','/contact','/policies/warranty']) {
      await page.goto(route);await expect(page.locator('main h1')).toBeVisible();await noOverflow(page);
      if(route==='/forgot-password') {
        await expect(page.getByText('Cửa hàng chưa kết nối dịch vụ email.',{exact:false})).toBeVisible();
        await expect(page.getByRole('button',{name:'Gửi liên kết',exact:true})).toBeDisabled();
      }
      if(width!==320) await page.screenshot({path:`qa/completeness/${route.slice(1).replaceAll('/','-')}-${width}.png`,fullPage:true});
    }
  }
});

test('admin uploads a photo and exact specifications; customers can zoom and filter',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signIn(page,'admin@demo.local');await page.goto('/admin/products');
  await page.getByRole('button',{name:'Thêm mới',exact:true}).click();
  await page.getByLabel('Tên thiết bị',{exact:true}).fill('QA Complete laptop');
  await page.getByLabel('Mã SKU',{exact:true}).fill('QA-COMPLETE-LAPTOP');
  await page.getByLabel('Giá bán (VND)',{exact:true}).fill('12000000');
  await page.getByLabel('Thương hiệu',{exact:false}).fill('QA Brand');
  await page.getByLabel('Mã model đầy đủ',{exact:false}).fill('Complete 16');
  await page.getByLabel('Thông số kỹ thuật',{exact:false}).fill('RAM: 16 GB\nSSD: 512 GB');
  await page.locator('input[type=file]').setInputFiles({name:'product.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1UAAAAASUVORK5CYII=','base64')});
  await expect(page.getByLabel('URL ảnh',{exact:false})).toHaveValue(/^\/api\/media\//);
  await expect.poll(()=>page.locator('.admin-image-preview img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(1);
  const save=page.waitForResponse(r=>r.url().endsWith('/api/products')&&r.request().method()==='POST');
  await page.getByRole('dialog').getByRole('button',{name:'Xác nhận',exact:true}).click();
  const p=(await (await save).json()).data;await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/products/'+p._id);await expect(page.getByRole('heading',{name:'QA Complete laptop',exact:true})).toBeVisible();
  await expect(page.locator('.product-information')).toContainText('16 GB');
  await expect(page.locator('.product-information')).toContainText('Complete 16');
  await page.locator('.gallery-main').click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});await noOverflow(page);
  await page.screenshot({path:'qa/completeness/product-specs-390.png',fullPage:true});
  await page.goto('/products?brand=QA%20Brand&inStock=false');await expect(page.locator('.product-card')).toHaveCount(1);
  const admin=await auth(request,'admin@demo.local');
  await request.delete('/api/products/'+p._id,{headers:{Authorization:'Bearer '+admin}});
  expect(errors).toEqual([]);
});

test('customer profile survives reload; delivered purchases can request warranty and receive a response',async({page,request})=>{
  const email=`qa-services-${Date.now()}@test.local`,password='Services!2026';
  expect((await request.post('/api/auth/register',{data:{fullName:'QA Services',email,password}})).status()).toBe(201);
  const token=await auth(request,email,password);const headers={Authorization:'Bearer '+token};
  const products=(await (await request.get('/api/products?inStock=true')).json()).data;
  const product=products[0];
  const addressResponse=await request.post('/api/addresses',{headers,data:{fullName:'QA Services',phone:'0901234567',province:'Hồ Chí Minh',ward:'Phường Sài Gòn',detail:'1 QA street'}});expect(addressResponse.status()).toBe(201);const address=(await addressResponse.json()).data;
  expect((await request.post('/api/cart/items',{headers,data:{productId:product._id,quantity:1}})).status()).toBe(200);
  const orderResponse=await request.post('/api/orders',{headers:{...headers,'Idempotency-Key':'qa-services-'+Date.now()},data:{addressId:address._id}});expect(orderResponse.status()).toBe(201);
  const order=(await orderResponse.json()).data;
  const admin=await auth(request,'admin@demo.local');const adminHeaders={Authorization:'Bearer '+admin};
  expect((await request.patch('/api/admin/orders/'+order._id+'/status',{headers:adminHeaders,data:{status:'CONFIRMED'}})).status()).toBe(200);
  const shipResponse=await request.post('/api/admin/shipping',{headers:adminHeaders,data:{orderId:order._id,carrier:'QA Delivery',trackingCode:'QA-SERVICES-'+Date.now(),carrierFee:0}});expect(shipResponse.status()).toBe(201);
  const raw=await shipResponse.json();const shipment=raw.shipment||raw.data;
  for(const status of ['PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED']) expect((await request.patch('/api/admin/shipping/'+shipment._id+'/status',{headers:adminHeaders,data:{status}})).status()).toBe(200);
  await signIn(page,email,password);await page.goto('/account');
  await page.getByLabel('Họ và tên',{exact:true}).fill('QA Updated Services');
  await page.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();await expect(page.getByRole('status')).toContainText('Đã lưu hồ sơ');
  await page.reload();await expect(page.getByLabel('Họ và tên',{exact:true})).toHaveValue('QA Updated Services');
  await expect(page.getByText('Thiết bị hiện tại',{exact:true})).toBeVisible();
  await page.locator('.account-devices-column').screenshot({path:'qa/logout-devices-desktop.png'});
  await page.setViewportSize({width:390,height:844});await noOverflow(page);
  await page.locator('.account-devices-column').screenshot({path:'qa/logout-devices-mobile.png'});
  await page.screenshot({path:'qa/completeness/profile-390.png',fullPage:true});
  await page.goto('/account?tab=support&orderId='+order._id);
  await page.getByRole('combobox',{name:'Loại yêu cầu',exact:true}).selectOption('WARRANTY');
  await page.getByLabel('Mô tả vấn đề',{exact:true}).fill('Thiết bị cần được kiểm tra bảo hành qua đơn đã giao.');
  const submitted=page.waitForResponse(r=>r.url().endsWith('/api/support')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Gửi yêu cầu',exact:true}).click();
  const response=await submitted;expect(response.status()).toBe(201);const support=(await response.json()).data;
  await expect(page.locator('.order-card')).toContainText('Chờ tiếp nhận');
  expect((await request.patch('/api/admin/support/'+support._id,{headers:adminHeaders,data:{status:'APPROVED',response:'Đã tiếp nhận, vui lòng gửi thiết bị để kiểm tra.'}})).status()).toBe(200);
  await page.reload();await expect(page.locator('.order-card')).toContainText('Đã tiếp nhận, vui lòng gửi thiết bị để kiểm tra.');
  await noOverflow(page);await page.screenshot({path:'qa/completeness/support-390.png',fullPage:true});
  await page.goto('/account?tab=notifications');await expect(page.locator('.order-card').filter({hasText:'Cập nhật yêu cầu sau mua'})).toBeVisible();
  await page.getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).click();
  await expect(page.locator('.order-card strong').filter({hasText:'· Mới'})).toHaveCount(0);
});
