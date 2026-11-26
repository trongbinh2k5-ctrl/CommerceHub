import {test,expect} from '@playwright/test';

test('Express serves built frontend, images, API and reloadable product routes',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/products');await expect(page.locator('.product-card')).not.toHaveCount(0);
  const link=page.locator('.product-card a[href^="/products/"]').first();await link.click();
  await expect(page).toHaveURL(/\/products\/[a-f\d]{24}$/);
  await page.reload();await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(async()=>{const r=await fetch('/health');return r.ok&&(await r.json()).success;})).toBe(true);
  const image=await page.request.get('/images/keyboard.jpg');expect(image.ok()).toBe(true);expect(image.headers()['content-type']).toContain('image/');
  expect((await page.request.get('/api/does-not-exist')).status()).toBe(404);expect(errors).toEqual([]);
});

test('same-origin sign-in session survives reload and nested account routes',async({page})=>{
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('customer@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page).not.toHaveURL(/\/login/);await page.goto('/account?tab=orders');await page.reload();await expect(page.getByRole('heading',{name:'Đơn hàng của tôi',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Đăng nhập tài khoản',exact:true})).toHaveCount(0);
});

test('frontend CSP permits payment form navigation without contacting the payment provider',async({page})=>{
  let submitted=false;await page.route('https://pay-sandbox.sepay.vn/**',route=>{submitted=route.request().method()==='POST';return route.fulfill({contentType:'text/html',body:'<h1>Mock payment</h1>'});});
  await page.goto('/');await page.evaluate(()=>{const form=document.createElement('form');form.method='POST';form.action='https://pay-sandbox.sepay.vn/mock';document.body.append(form);form.submit();});
  await expect(page.getByRole('heading',{name:'Mock payment'})).toBeVisible();expect(submitted).toBe(true);
});
