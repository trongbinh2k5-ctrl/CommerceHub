import {test,expect} from '@playwright/test';
test('admin records an external refund with proof and sees completion',async({page})=>{
 const id='507f1f77bcf86cd799439011';let completed=false;
 const order={_id:id,status:'CANCELLED',paymentMethod:'SEPAY',createdAt:new Date().toISOString(),totalAmount:100000,shippingAddress:{fullName:'QA',phone:'0901234567',detail:'123 Đường QA',ward:'Phường Sài Gòn',province:'Hồ Chí Minh'},items:[{productId:'507f1f77bcf86cd799439012',name:'Thiết bị kiểm thử',sku:'QA-REFUND',quantity:1,subtotal:100000}]};
 const payment=()=>({_id:'507f1f77bcf86cd799439013',orderId:id,status:'PAID',amount:100000,refundStatus:completed?'COMPLETED':'REQUESTED',refundAmount:completed?100000:0,refundedAt:completed?new Date().toISOString():null});
 await page.route('**/api/admin/orders?*',route=>route.fulfill({json:{success:true,data:[order]}}));
 await page.route('**/api/admin/payments/orders/'+id,route=>route.fulfill({json:{success:true,data:payment()}}));
 await page.route('**/api/admin/payments/orders/'+id+'/refund-complete',route=>{expect(route.request().postDataJSON()).toEqual({amount:100000,reference:'BANK-REFUND-001',confirmed:true});completed=true;return route.fulfill({json:{success:true,data:payment()}});});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
 await page.goto('/admin/orders');await page.getByRole('button',{name:'Duyệt đơn',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Đang chờ cửa hàng xử lý hoàn tiền.');
 await dialog.locator('summary').filter({hasText:'Xác nhận hoàn tiền'}).click();await dialog.getByLabel('Mã giao dịch hoàn tiền',{exact:true}).fill('BANK-REFUND-001');await dialog.getByLabel('Đã hoàn đủ tiền thực tế',{exact:true}).check();
 await page.setViewportSize({width:390,height:850});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/full-audit-2026-11-24/refund-390.png',fullPage:true});
 await dialog.getByRole('button',{name:'Xác nhận đã hoàn tiền',exact:true}).click();await expect(dialog).toContainText('Đã hoàn tiền · 100.000');await expect(dialog.getByRole('button',{name:'Xác nhận đã hoàn tiền',exact:true})).toHaveCount(0);
});
