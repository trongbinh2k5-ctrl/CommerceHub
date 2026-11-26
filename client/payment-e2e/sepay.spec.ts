import { test,expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

test('SePay checkout posts signed form; return waits for authenticated IPN',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // A production callback on another host must not hijack the current site or block checkout.
  await page.route('**/api/payments/sepay/options',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{enabled:true,environment:'production',checkoutOrigin:'https://different-payment-demo.example',returnMode:'redirect'}})}));
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('customer@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
  await page.goto('/products');await page.locator('.product-card').first().getByRole('link').first().click();await page.getByRole('button',{name:'Thêm vào giỏ'}).click();await page.goto('/checkout');
  await page.getByRole('button',{name:'Thêm địa chỉ'}).click();
  for(const [label,value] of [['Người nhận','SePay Browser QA'],['Số điện thoại','0901234567'],['Tỉnh / Thành phố','HCM'],['Phường / Xã','Test'],['Số nhà, đường, địa chỉ chi tiết','123 Test']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByRole('button',{name:'Lưu địa chỉ'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('radio',{name:/^VNPAY/})).toHaveCount(0);
  await page.getByRole('button',{name:/^Chuyển khoản SePay/}).click();
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'qa/sepay/checkout-mobile.png',fullPage:true});
  let fields=new URLSearchParams();
  await page.route('https://pay-sandbox.sepay.vn/**',async route=>{
    expect(route.request().method()).toBe('POST');fields=new URLSearchParams(route.request().postData()||'');
    await route.fulfill({contentType:'text/html',body:'<h1>SePay sandbox intercepted by browser test</h1>'});
  });
  await page.getByRole('button',{name:'Xác nhận đặt hàng'}).click();await expect(page.getByRole('heading',{name:'SePay sandbox intercepted by browser test'})).toBeVisible();
  expect(fields.get('merchant')).toBe('TESTMERCHANT');expect(fields.get('signature')).toBeTruthy();expect(fields.get('payment_method')).toBe('BANK_TRANSFER');
  const signedFields=['order_amount','merchant','currency','operation','order_description','order_invoice_number','payment_method','success_url','error_url','cancel_url'];
  expect(fields.get('signature')).toBe(createHmac('sha256','spsk_test_browser_fake_secret').update(signedFields.map(k=>`${k}=${fields.get(k)}`).join(',')).digest('base64'));
  const ref=fields.get('order_invoice_number')!,amount=fields.get('order_amount')!;
  const callback=new URL(fields.get('success_url')!);
  await page.goto(callback.pathname+callback.search);await expect(page.getByRole('heading',{name:'Đang chờ xác nhận từ SePay'})).toBeVisible();
  await page.screenshot({path:'qa/sepay/return-pending.png',fullPage:true});
  const body={timestamp:Math.floor(Date.now()/1000),notification_type:'ORDER_PAID',order:{order_id:'SEPAY-'+ref,order_invoice_number:ref,order_status:'CAPTURED',order_amount:amount+'.00',order_currency:'VND'},transaction:{id:'TX-'+ref,transaction_type:'PAYMENT',payment_method:'BANK_TRANSFER',transaction_status:'APPROVED',transaction_amount:amount,transaction_currency:'VND'}};
  const unauthorized=await request.post('/api/payments/sepay/ipn',{data:body});expect(unauthorized.status()).toBe(401);
  const ipn=await request.post('/api/payments/sepay/ipn',{data:body,headers:{'X-Secret-Key':'isolated-browser-ipn-secret-32-bytes'}});expect(ipn.status()).toBe(200);
  await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();await expect(page.getByRole('heading',{name:'Đã xác nhận thanh toán'})).toBeVisible();await page.getByRole('link',{name:'Xem đơn hàng',exact:true}).click();
  await expect(page.getByText('Đã xác nhận thanh toán SePay.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Hủy đơn hàng',exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/sepay/order-paid-mobile.png',fullPage:true});
  // A callback on a host without a cookie can authenticate and resume the same invoice safely.
  await page.context().clearCookies();await page.goto(callback.pathname+callback.search);
  await expect(page.getByRole('link',{name:'Đăng nhập xem kết quả',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Đăng nhập xem kết quả',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('customer@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/payments/sepay/return\\?ref='+ref));
  await expect(page.getByRole('heading',{name:'Đã xác nhận thanh toán'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('failed gateway opening stays on one order with visible errors and stacked mobile payment actions',async({page,request})=>{
  const login=await request.post('/api/auth/login',{data:{email:'customer@demo.local',password:'DemoCommerce!2026'}});
  const token=(await login.json()).data.accessToken;
  const headers={Authorization:`Bearer ${token}`};
  const before=(await (await request.get('/api/orders',{headers})).json()).data.length;
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('customer@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
  await page.goto('/products');await page.locator('.product-card').first().getByRole('link').first().click();await page.getByRole('button',{name:'Thêm vào giỏ'}).click();await page.goto('/checkout');
  // Independent when this case is run alone, as well as in the full file.
  if(await page.locator('input[name=address]').count()===0){
    await page.getByRole('button',{name:'Thêm địa chỉ'}).click();
    for(const [label,value] of [['Người nhận','SePay Error QA'],['Số điện thoại','0901234567'],['Tỉnh / Thành phố','HCM'],['Phường / Xã','Test'],['Số nhà, đường, địa chỉ chi tiết','123 Test']])await page.getByLabel(label,{exact:true}).fill(value);
    await page.getByRole('button',{name:'Lưu địa chỉ'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button',{name:/^Chuyển khoản SePay/}).click();
  await expect(page.locator('.payment-method-choice.selected')).toContainText('SePay');
  await page.route('**/api/payments/sepay/orders/*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Cổng thử nghiệm tạm không kết nối được.'})}));
  await page.getByRole('button',{name:'Xác nhận đặt hàng'}).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9]+$/);
  await expect(page.getByRole('alert')).toContainText('Đơn hàng đã được tạo nhưng chưa mở được SePay');
  const orderUrl=page.url();
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:850});
    const panel=page.locator('.payment-panel');await expect(panel).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const buttons=await panel.getByRole('button').all();let bottom=0;
    for(const button of buttons){const rect=(await button.boundingBox())!;expect(rect.y).toBeGreaterThanOrEqual(bottom);expect(rect.width).toBeLessThanOrEqual((await panel.boundingBox())!.width);bottom=rect.y+rect.height;}
    await page.screenshot({path:`qa/sepay/order-pending-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Thanh toán qua SePay',exact:true}).click();
  await expect(page.locator('.payment-panel').getByRole('alert')).toContainText('Cổng thử nghiệm tạm không kết nối được.');
  expect(page.url()).toBe(orderUrl);
  const after=(await (await request.get('/api/orders',{headers})).json()).data.length;
  expect(after).toBe(before+1);
});
