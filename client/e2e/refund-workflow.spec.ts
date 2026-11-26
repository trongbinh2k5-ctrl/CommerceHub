import {test,expect,type Page} from '@playwright/test';
const orderId='507f1f77bcf86cd799439011',paymentId='507f1f77bcf86cd799439013';
const bank={bankName:'MB Bank',accountNumber:'123456789',accountHolder:'QA CUSTOMER'};
const order={_id:orderId,status:'CANCELLED',paymentMethod:'SEPAY',createdAt:new Date().toISOString(),totalAmount:100000,shippingAddress:{fullName:'QA',phone:'0901234567',detail:'123 Đường QA',ward:'Phường Sài Gòn',province:'Hồ Chí Minh'},items:[{productId:'507f1f77bcf86cd799439012',name:'Thiết bị QA',quantity:1,subtotal:100000}]};
async function login(page:Page,role:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(role+'@demo.local');await page.getByLabel('Mật khẩu',{exact:true}).fill('DemoCommerce!2026');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/login/);}

test('customer supplies refund recipient and sees processing milestones and transfer reference',async({page})=>{
 let saved=false,processing=false,completed=false;
 const payment=()=>({_id:paymentId,orderId,amount:100000,status:'PAID',refundStatus:completed?'COMPLETED':processing?'PROCESSING':'REQUESTED',refundRequestedAt:'2026-11-24T10:00:00Z',refundRecipientSubmittedAt:saved?'2026-11-24T10:01:00Z':null,refundProcessingAt:processing?'2026-11-24T10:02:00Z':null,refundedAt:completed?'2026-11-24T10:03:00Z':null,refundAmount:completed?100000:0,refundReference:completed?'BANK-REFUND-002':undefined});
 await page.route('**/api/orders/'+orderId,route=>route.fulfill({json:{success:true,data:order}}));
 await page.route('**/api/payments/orders/'+orderId,route=>route.fulfill({json:{success:true,data:payment()}}));
 await page.route('**/api/payments/orders/'+orderId+'/refund-details',route=>{if(route.request().method()==='PATCH'){expect(route.request().postDataJSON()).toEqual(bank);saved=true;}return route.fulfill({json:{success:true,data:{recipient:saved?bank:null,submittedAt:saved?'2026-11-24T10:01:00Z':null}}});});
 await login(page,'customer');await page.goto('/orders/'+orderId);const summary=page.locator('.summary');
 await summary.getByLabel('Ngân hàng',{exact:true}).fill(bank.bankName);await summary.getByLabel('Số tài khoản',{exact:true}).fill(bank.accountNumber);await summary.getByLabel('Tên chủ tài khoản',{exact:true}).fill(bank.accountHolder);await summary.getByRole('button',{name:'Gửi thông tin nhận tiền',exact:true}).click();await expect(summary).toContainText('Đã gửi thông tin nhận tiền.');await expect(summary).toContainText('•••• 6789');
 processing=true;await page.reload();await expect(summary).toContainText('Đang xử lý hoàn tiền.');await expect(summary.getByRole('button',{name:'Gửi thông tin nhận tiền',exact:true})).toHaveCount(0);await expect(summary).toContainText('Thông tin đã khóa');
 completed=true;await page.reload();await expect(summary).toContainText('BANK-REFUND-002');await expect(summary).toContainText('Đã hoàn tiền · 100.000');
 await page.setViewportSize({width:390,height:850});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/refund-workflow/customer-390.png',fullPage:true});
});

test('admin opens refund queue, copies frozen recipient and records payment without finding the order again',async({page})=>{
 let processing=false,completed=false,startCount=0;
 await page.route('**/api/admin/orders/summary',route=>route.fulfill({json:{success:true,data:{awaitingApproval:3,awaitingPayment:1}}}));
 await page.route('**/api/chat/unread',route=>route.fulfill({json:{success:true,data:{count:105}}}));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).__refundCopy=text;}}});});
 const row=()=>({_id:paymentId,orderId,customerName:'QA',amount:100000,status:'PAID',refundStatus:completed?'COMPLETED':processing?'PROCESSING':'REQUESTED',refundRequestedAt:'2026-11-24T10:00:00Z',refundRecipientSubmittedAt:'2026-11-24T10:01:00Z',refundProcessingAt:processing?'2026-11-24T10:02:00Z':null,refundRecipient:bank,refundedAt:completed?'2026-11-24T10:03:00Z':null,refundAmount:completed?100000:0,refundReference:completed?'BANK-REFUND-003':undefined});
 await page.route('**/api/admin/payments/refunds?*',route=>{const status=new URL(route.request().url()).searchParams.get('status');const visible=status==='COMPLETED'?completed:!completed;return route.fulfill({json:{success:true,data:visible?[row()]:[],pagination:{page:1,total:visible?1:0,totalPages:visible?1:0}}});});
 await page.route('**/api/admin/payments/orders/'+orderId+'/refund-start',route=>{processing=true;startCount++;return route.fulfill({json:{success:true,data:{status:'PROCESSING'}}});});
 await page.route('**/api/admin/payments/orders/'+orderId+'/refund-complete',route=>{expect(route.request().postDataJSON()).toEqual({amount:100000,reference:'BANK-REFUND-003',confirmed:true});completed=true;return route.fulfill({json:{success:true,data:row()}});});
 await login(page,'admin');await page.goto('/admin/refunds');await expect(page.getByRole('heading',{name:'Hoàn tiền',exact:true})).toBeVisible();await page.getByRole('button',{name:'Xử lý hoàn tiền',exact:true}).click();await expect(page.getByRole('button',{name:'Sao chép STK',exact:true})).toBeEnabled();expect(startCount).toBe(1);await page.getByRole('button',{name:'Sao chép STK',exact:true}).click();expect(await page.evaluate(()=>(window as any).__refundCopy)).toBe(bank.accountNumber);
 const sidebar=page.locator('.admin-sidebar');
 await expect(sidebar.getByRole('link',{name:'Đơn hàng',exact:true}).locator('.admin-work-count')).toHaveText('3');
 await expect(sidebar.getByRole('link',{name:'Hoàn tiền',exact:true}).locator('.admin-work-count')).toHaveText('1');
 await expect(sidebar.getByRole('link',{name:'Hội thoại',exact:true}).locator('.admin-work-count')).toHaveText('99+');
 await page.getByLabel('Mã giao dịch hoàn tiền',{exact:true}).fill('BANK-REFUND-003');await page.getByLabel('Đã hoàn đủ tiền thực tế',{exact:true}).check();await page.setViewportSize({width:390,height:850});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'qa/refund-workflow/admin-390.png',fullPage:true});
 await page.getByRole('button',{name:'Xác nhận đã hoàn tiền',exact:true}).click();await expect(page.getByText('Đã xác nhận hoàn tiền.',{exact:true})).toBeVisible();await expect(page.getByText('Không có khoản hoàn tiền.',{exact:true})).toBeVisible();await expect(sidebar.getByRole('link',{name:'Hoàn tiền',exact:true}).locator('.admin-work-count')).toHaveCount(0);await page.getByLabel('Trạng thái',{exact:true}).selectOption('COMPLETED');await page.getByRole('button',{name:'Xem khoản hoàn',exact:true}).click();await expect(page.locator('.refund-workspace')).toContainText('BANK-REFUND-003');
});

test('staff cannot open the bank recipient queue',async({page})=>{
 await login(page,'staff');await page.goto('/admin/refunds');await expect(page).toHaveURL(/\/admin\/orders$/);await expect(page.locator('.admin-sidebar').getByRole('link',{name:'Hoàn tiền',exact:true})).toHaveCount(0);
});
