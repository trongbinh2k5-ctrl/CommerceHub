import {test,expect} from '@playwright/test';
test('header shows new notifications, clears badge after reading, and fits phones',async({page})=>{
 let unread=2;
 await page.route('**/api/orders/summary',route=>route.fulfill({json:{success:true,data:{awaitingApproval:3,awaitingPayment:2}}}));
 await page.route('**/api/notifications?*',route=>route.fulfill({json:{success:true,data:[{_id:'507f1f77bcf86cd799439011',title:'Đơn hàng đã hủy',message:'Đang chờ cửa hàng xử lý hoàn tiền.',href:'/account?tab=orders',createdAt:new Date().toISOString(),readAt:unread?null:new Date().toISOString()}],unread,pagination:{page:1,total:1,totalPages:1}}}));
 await page.route('**/api/notifications/read',route=>{unread=0;return route.fulfill({json:{success:true}});});
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('customer@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
 const bell=page.getByRole('link',{name:'Thông báo, 2 chưa đọc',exact:true});await expect(bell).toBeVisible();
 await expect(page.locator('.pending-order-notice')).toHaveCount(0);
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:850});await expect(bell).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.cart-count')).toHaveCSS('background-color','rgb(198, 40, 40)');}
 await bell.click();await expect(page.getByText('Đang chờ cửa hàng xử lý hoàn tiền.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Đánh dấu đã đọc',exact:false}).click();await expect(page.locator('.notification-count')).toHaveCount(0);await expect(page.getByRole('link',{name:'Thông báo',exact:true})).toBeVisible();
});
test('pending approval count belongs below search on admin orders',async({page})=>{
 await page.route('**/api/admin/orders/summary',route=>route.fulfill({json:{success:true,data:{awaitingApproval:7,awaitingPayment:2}}}));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);
 await page.goto('/admin/orders');const notice=page.locator('.admin-order-summary');await expect(notice).toHaveText('Còn 7 đơn hàng chưa duyệt');
 const toolbar=page.locator('.resource-toolbar');expect((await notice.boundingBox())!.y).toBeGreaterThanOrEqual((await toolbar.boundingBox())!.y+(await toolbar.boundingBox())!.height);
 await page.getByLabel('Tìm trên toàn hệ thống',{exact:true}).fill('không có kết quả');await expect(notice).toContainText('Còn 7 đơn hàng chưa duyệt');
 await page.setViewportSize({width:320,height:850});await expect(notice).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
