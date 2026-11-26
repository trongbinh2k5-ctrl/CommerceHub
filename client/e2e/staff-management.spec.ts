import { test, expect, type Page } from '@playwright/test';
async function login(page:Page,email:string,password:string) {
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
const fits=async(page:Page)=>expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

test('admin provisions staff; mandatory setup, recovery, revocation and audit work end to end',async({page,browser})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const email=`qa-onboarding-${Date.now()}@test.local`,permanent='PrivateEmployee!2026';
  await login(page,'admin@demo.local','DemoCommerce!2026');await page.goto('/admin/users');
  await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();
  await page.getByLabel('Họ tên nhân viên',{exact:true}).fill('QA Nhân viên riêng');
  await page.getByLabel('Email nhân viên',{exact:true}).fill(email);
  await page.getByLabel('Mật khẩu hiện tại của admin',{exact:true}).fill('DemoCommerce!2026');
  const created=page.waitForResponse(r=>r.url().endsWith('/api/admin/users')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Tạo nhân viên',exact:true}).click();const response=await created;expect(response.status()).toBe(201);
  const data=(await response.json()).data;
  await expect(page.getByRole('dialog',{name:'Lưu thông tin đăng nhập tạm',exact:true})).toBeVisible();
  await expect(page.getByLabel('Mật khẩu tạm',{exact:true})).toHaveAttribute('type','password');
  await expect(page.getByRole('button',{name:'Đã lưu, đóng',exact:true})).toBeDisabled();
  await page.setViewportSize({width:390,height:844});await fits(page);await page.screenshot({path:'qa/staff/temporary-credential-390.png'});
  await page.getByRole('checkbox',{name:'Tôi đã lưu thông tin để chuyển cho nhân viên.',exact:true}).check();await page.getByRole('button',{name:'Đã lưu, đóng',exact:true}).click();
  await page.getByLabel('Tìm tài khoản',{exact:true}).fill(email);await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText('Cần đổi mật khẩu');
  await page.screenshot({path:'qa/staff/staff-list-390.png',fullPage:true});
  const employeeContext=await browser.newContext({viewport:{width:390,height:844}}),employee=await employeeContext.newPage();employee.on('pageerror',e=>errors.push(e.message));
  try {
    await login(employee,email,data.temporaryPassword);await expect(employee).toHaveURL(/change-password-required/);
    await employee.reload();await expect(employee.getByRole('heading',{name:'Đổi mật khẩu trước khi làm việc',exact:true})).toBeVisible();
    await employee.goto('/admin/products');await expect(employee).toHaveURL(/change-password-required/);
    await employee.getByLabel('Mật khẩu hiện tại hoặc mật khẩu tạm',{exact:true}).fill(data.temporaryPassword);
    await employee.getByLabel('Mật khẩu mới',{exact:true}).fill(permanent);await employee.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill(permanent+'x');
    await employee.getByRole('button',{name:'Lưu mật khẩu riêng',exact:true}).click();await expect(employee.getByRole('alert')).toContainText('chưa khớp');
    await employee.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill(permanent);await fits(employee);await employee.screenshot({path:'qa/staff/onboarding-390.png',fullPage:true});
    await employee.getByRole('button',{name:'Lưu mật khẩu riêng',exact:true}).click();await expect(employee.getByRole('heading',{name:'Đã thiết lập mật khẩu riêng',exact:true})).toBeVisible();
    await employee.getByRole('link',{name:'Đăng nhập lại',exact:true}).click();await employee.getByLabel('Email',{exact:true}).fill(email);await employee.getByLabel('Mật khẩu',{exact:true}).fill(permanent);await employee.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await expect(employee.getByRole('link',{name:'Tài khoản QA Nhân viên riêng',exact:true})).toBeVisible();
    await employee.goto('/account');await expect(employee.getByLabel('Họ và tên',{exact:true})).toHaveValue('QA Nhân viên riêng');
    await expect(employee.getByLabel('Mật khẩu mới',{exact:true})).toHaveAttribute('minlength','10');
    await employee.goto('/admin/orders');await expect(employee.getByRole('heading',{name:'Đơn hàng.',exact:true})).toBeVisible();
    await expect(employee.locator('.admin-sidebar').getByRole('link',{name:'Nhật ký quản trị',exact:true})).toHaveCount(0);
    await page.reload();const row=page.locator('tbody tr').filter({hasText:email});await expect(row).toBeVisible();
    await row.getByRole('button',{name:'Cấp lại mật khẩu tạm',exact:true}).click();
    await page.getByLabel('Lý do cấp lại',{exact:true}).fill('Nhân viên báo quên mật khẩu, đã xác nhận danh tính.');await page.getByLabel('Mật khẩu hiện tại của admin',{exact:true}).fill('DemoCommerce!2026');
    const issued=page.waitForResponse(r=>r.url().endsWith('/temporary-password')&&r.request().method()==='POST');
    await page.getByRole('dialog').getByRole('button',{name:'Cấp mật khẩu tạm',exact:true}).click();const issuedResponse=await issued;expect(issuedResponse.status()).toBe(200);const reissued=(await issuedResponse.json()).data;
    expect(reissued.temporaryPassword).not.toBe(data.temporaryPassword);
    await page.getByRole('checkbox',{name:'Tôi đã lưu thông tin để chuyển cho nhân viên.',exact:true}).check();await page.getByRole('button',{name:'Đã lưu, đóng',exact:true}).click();
    await employee.reload();await expect(employee).toHaveURL(/\/login$/);
    await row.getByRole('button',{name:'Khóa',exact:true}).click();await page.getByRole('button',{name:'Xác nhận thay đổi',exact:true}).click();await expect(row).toContainText('Đã khóa');
    await expect(row.getByRole('button',{name:'Cấp lại mật khẩu tạm',exact:true})).toHaveCount(0);
    await page.goto('/admin/audit');await page.getByRole('textbox',{name:'ID đối tượng',exact:true}).fill(data.user.id);
    await expect(page.locator('.audit-card')).toHaveCount(4);await expect(page.locator('.audit-list')).toContainText('QA Nhân viên riêng');
    await page.getByRole('combobox',{name:'Lọc hành động',exact:true}).selectOption('PASSWORD_CHANGED');await expect(page.locator('.audit-card')).toHaveCount(1);await expect(page.locator('.audit-card')).toContainText('Nhân viên hoàn tất đổi mật khẩu bắt buộc.');
    await page.getByRole('combobox',{name:'Lọc hành động',exact:true}).selectOption('');await fits(page);await page.screenshot({path:'qa/staff/audit-390.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});await fits(page);await page.screenshot({path:'qa/staff/audit-1280.png',fullPage:true});
    expect(errors).toEqual([]);
  }finally{await employeeContext.close();}
});
