import { test,expect } from '@playwright/test';

test('GHN test controls quote, create and sync without a real carrier; parcel form fits narrow screens',async({page})=>{
  const orderId='507f1f77bcf86cd799439011';
  const order={_id:orderId,status:'CONFIRMED',paymentMethod:'COD',totalAmount:120000,shippingAddress:{fullName:'GHN UI Test',phone:'0901234567',detail:'123 Test',ward:'Phường Sài Gòn',province:'Hồ Chí Minh'}};
  let created=false,delivered=false,createCount=0;
  const parcel={weight:500,length:20,width:15,height:10};
  await page.route('**/api/admin/orders?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:[order]})}));
  const shipment=()=>({_id:'507f1f77bcf86cd799439012',orderId,trackingCode:'GHNTEST01',carrier:'GHN (test)',carrierFee:32000,provider:'GHN',providerStatus:delivered?'delivered':'ready_to_pick',status:delivered?'DELIVERED':'READY'});
  await page.route('**/api/admin/shipping?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:created?[shipment()]:[]})}));
  await page.route('**/api/admin/shipping/ghn/**',async route=>{
    const url=new URL(route.request().url());let data:unknown;
    if(url.pathname.endsWith('/options'))data={enabled:true,environment:'staging'};
    else if(route.request().method()==='GET')data=created?{state:'CREATED',parcel}:null;
    else if(url.pathname.endsWith('/preview'))data={fee:32000,codAmount:120000};
    else if(url.pathname.endsWith('/create')){expect(route.request().postDataJSON()).toEqual(parcel);created=true;createCount++;data=shipment();}
    else if(url.pathname.endsWith('/sync')){delivered=true;data=shipment();}
    else throw new Error('Unexpected mock route: '+url.pathname);
    await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
  await page.goto('/admin/shipping');const panel=page.locator('.ghn-panel');await expect(panel).toBeVisible();
  await panel.getByLabel('Đơn hàng đã xác nhận').selectOption(orderId);
  for(const [label,value] of [['Khối lượng sau đóng gói (gram)','500'],['Dài (cm)','20'],['Rộng (cm)','15'],['Cao (cm)','10']])await panel.getByLabel(label,{exact:true}).fill(value);
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:850});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`qa/ghn/form-${width}.png`,fullPage:true});}
  await panel.getByRole('button',{name:'Xem phí GHN',exact:true}).click();await expect(panel.getByRole('status')).toContainText('32.000');
  await panel.getByRole('button',{name:'Tạo vận đơn GHN test',exact:true}).click();await expect(panel.getByText('Đã tạo vận đơn GHN test: GHNTEST01',{exact:true})).toBeVisible();
  await expect(page.locator('tbody')).toContainText('GHNTEST01');expect(createCount).toBe(1);
  await page.getByRole('button',{name:'Đồng bộ GHN',exact:true}).click();await expect(page.locator('tbody')).toContainText('Đã giao');
  await expect(page.getByRole('button',{name:'Hủy tại GHN',exact:true})).toHaveCount(0);
});
