import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { LoginSession, AccountChallenge } from '../src/modules/auth/account.models';
import { AuditEvent } from '../src/modules/operations/audit.service';
import { Product } from '../src/modules/products/product.model';
import { StockMovement } from '../src/modules/operations/operations.models';
import { Order } from '../src/modules/orders/order.model';
import { Payment } from '../src/modules/payments/payment.model';
import { setTestMailTransport, type Mail } from '../src/modules/auth/mail.service';

test('Staff provisioning, mandatory password setup and transactional audit', {timeout:120000}, async t=>{
  process.env.NODE_ENV='test';process.env.EMAIL_VERIFICATION_REQUIRED='false';process.env.JWT_ACCESS_SECRET='isolated-staff-management-test-secret';
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  let server:ReturnType<typeof app.listen>|undefined;
  try {
    await mongoose.connect(mongo.getUri('staff_management'));
    await Promise.all(Object.values(mongoose.models).map(model=>model.init()));
    const adminPassword='AdminPrivate!2026',newPassword='Employee10';
    const hash=await bcrypt.hash(adminPassword,4);
    const [admin,customer,oldStaff]=await User.create(['ADMIN','CUSTOMER','STAFF'].map((role,i)=>({fullName:role,email:`staff-test-${i}@test.local`,role,passwordHash:hash})));
    const bearer=(user:any)=>jwt.sign({role:user.role},process.env.JWT_ACCESS_SECRET!,{subject:user.id});
    const at=bearer(admin),ct=bearer(customer),st=bearer(oldStaff);
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
    const api=async(path:string,method='GET',body?:unknown,token?:string,headers:Record<string,string>={})=>{
      const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:await response.json() as any,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
    };
    const input={fullName:'QA Nhân viên',email:'employee@test.local',phone:'0901234567',currentPassword:adminPassword};
    let staffId='',temporary='',pendingAccess='',pendingCookie='',access='',activeCookie='',productId='';

    await t.test('customer and staff cannot provision, reset others, or read audit',async()=>{
      for(const token of [undefined,ct,st]) {
        const expected=token?403:401;
        assert.equal((await api('/admin/users','POST',input,token)).status,expected);
        assert.equal((await api('/admin/users/'+oldStaff.id+'/temporary-password','POST',{currentPassword:adminPassword,reason:'Reissue for testing'},token)).status,expected);
        assert.equal((await api('/admin/audit','GET',undefined,token)).status,expected);
      }
      assert.equal(await AuditEvent.countDocuments(),0);
    });
    await t.test('provisioning validates identity, rejects admin escalation, and reauthenticates admin',async()=>{
      assert.equal((await api('/admin/users','POST',{...input,email:'invalid'},at)).status,400);
      assert.equal((await api('/admin/users','POST',{...input,role:'ADMIN'},at)).status,400);
      assert.equal((await api('/admin/users','POST',{...input,currentPassword:undefined},at)).status,400);
      assert.equal((await api('/admin/users','POST',{...input,currentPassword:'wrong'},at)).status,403);
      assert.equal(await User.countDocuments(),3);assert.equal(await AuditEvent.countDocuments(),0);
    });
    await t.test('temporary credential is random, hashed, expires in 24 hours and only returned on issuance',async()=>{
      const r=await api('/admin/users','POST',input,at);assert.equal(r.status,201);assert.match(r.headers.get('cache-control')! ,/no-store/);
      staffId=r.body.data.user.id;temporary=r.body.data.temporaryPassword;
      assert.ok(temporary.length>=24);assert.equal(r.body.data.user.role,'STAFF');assert.equal(r.body.data.user.mustChangePassword,true);
      const user=await User.findById(staffId).select('+passwordHash');assert.ok(await bcrypt.compare(temporary,user!.passwordHash));assert.notEqual(user!.passwordHash,temporary);
      assert.ok(user!.temporaryPasswordExpiresAt!.getTime()>Date.now()+23*3600000);assert.equal(user!.emailVerifiedAt,null);
      const events=await AuditEvent.find({targetId:staffId}).lean();assert.equal(events.length,1);assert.equal(events[0]!.action,'STAFF_CREATED');assert.equal(String(events[0]!.actorId),admin.id);
      const list=await api('/admin/users?role=STAFF&search=employee','GET',undefined,at);assert.equal(list.body.data.length,1);
      assert.equal(list.body.data[0].passwordHash,undefined);assert.equal(list.body.data[0].temporaryPassword,undefined);
      assert.ok(!JSON.stringify(events).includes(temporary));assert.ok(!JSON.stringify(events).includes(user!.passwordHash));
    });
    await t.test('duplicate email cannot overwrite or silently promote a customer',async()=>{
      assert.equal((await api('/admin/users','POST',input,at)).status,409);
      assert.equal((await api('/admin/users','POST',{...input,email:customer.email},at)).status,409);
      assert.equal((await User.findById(customer.id))!.role,'CUSTOMER');assert.equal(await User.countDocuments(),4);
      assert.equal(await AuditEvent.countDocuments({action:'STAFF_CREATED'}),1);
    });
    await t.test('pending login and refresh only expose account setup, including when email verification is required',async()=>{
      process.env.EMAIL_VERIFICATION_REQUIRED='true';
      const r=await api('/auth/login','POST',{email:input.email,password:temporary});assert.equal(r.status,200);
      pendingAccess=r.body.data.accessToken;pendingCookie=r.cookie!;assert.equal(r.body.data.user.mustChangePassword,true);
      assert.equal((await api('/auth/me','GET',undefined,pendingAccess)).body.data.mustChangePassword,true);
      const refresh=await api('/auth/refresh','POST',undefined,undefined,{Cookie:pendingCookie});assert.equal(refresh.status,200);pendingCookie=refresh.cookie!;
      assert.equal(refresh.body.data.user.mustChangePassword,true);
      process.env.EMAIL_VERIFICATION_REQUIRED='false';
    });
    await t.test('direct API calls cannot bypass forced password change or self-clear the flag',async()=>{
      for(const [path,method,body] of [
        ['/admin/products','GET',undefined],['/admin/orders','GET',undefined],['/admin/settings','GET',undefined],['/auth/sessions','GET',undefined],
        ['/products','POST',{name:'Bypass',sku:'BYPASS',price:100}],['/auth/profile','PATCH',{fullName:'Changed',mustChangePassword:false}],
        ['/auth/email-change','POST',{email:'steal@test.local',password:temporary}],
      ] as const){const r=await api(path,method,body,pendingAccess);assert.equal(r.status,403,path);assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED');}
      assert.equal(await Product.countDocuments(),0);assert.equal((await User.findById(staffId))!.mustChangePassword,true);
    });
    await t.test('setup validates current password, strength and difference; success revokes every old session',async()=>{
      assert.equal((await api('/auth/change-password','POST',{currentPassword:'wrong',password:newPassword},pendingAccess)).status,400);
      assert.equal((await api('/auth/change-password','POST',{currentPassword:temporary,password:temporary},pendingAccess)).status,400);
      assert.equal((await api('/auth/change-password','POST',{currentPassword:temporary,password:'short1234'},pendingAccess)).status,400);
      assert.equal((await api('/auth/change-password','POST',{currentPassword:temporary,password:newPassword},pendingAccess)).status,200);
      const user=await User.findById(staffId);assert.equal(user!.mustChangePassword,false);assert.equal(user!.temporaryPasswordExpiresAt,null);
      assert.equal(await LoginSession.countDocuments({userId:staffId}),0);
      assert.equal((await api('/auth/me','GET',undefined,pendingAccess)).status,401);
      assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:pendingCookie})).status,401);
      assert.equal((await api('/auth/login','POST',{email:input.email,password:temporary})).status,401);
      const r=await api('/auth/login','POST',{email:input.email,password:newPassword});assert.equal(r.status,200);access=r.body.data.accessToken;activeCookie=r.cookie!;
      assert.equal((await api('/admin/orders','GET',undefined,access)).status,200);
      assert.equal((await api('/admin/users','GET',undefined,access)).status,403);
      assert.equal(await AuditEvent.countDocuments({action:'PASSWORD_CHANGED',actorId:staffId}),1);
    });
    await t.test('product and inventory audits capture actor and before/after values',async()=>{
      const r=await api('/products','POST',{name:'Audited device',sku:'AUDIT-1',price:100000,stock:5},access);assert.equal(r.status,201);productId=r.body.data._id;
      assert.equal((await api('/products/'+productId,'PATCH',{price:125000},access)).status,200);
      const price=await AuditEvent.findOne({action:'PRODUCT_UPDATED',targetId:productId}).lean();assert.equal(String(price!.actorId),staffId);assert.deepEqual(price!.changes.map(c=>({field:c.field,before:c.before,after:c.after})),[{field:'price',before:100000,after:125000}]);
      const count=await AuditEvent.countDocuments();assert.equal((await api('/products/'+productId,'PATCH',{price:-1},access)).status,400);assert.equal(await AuditEvent.countDocuments(),count);
      assert.equal((await api('/admin/products/'+productId+'/stock','PATCH',{delta:2,reason:'Nhập thêm hai sản phẩm đã kiểm tra'},access)).status,200);
      const movement=await AuditEvent.findOne({action:'STOCK_ADJUSTED',targetId:productId}).lean();assert.equal(movement!.changes[0]!.before,5);assert.equal(movement!.changes[0]!.after,7);
      assert.equal(await StockMovement.countDocuments({productId}),1);
    });
    await t.test('COD confirmation and audit commit once under concurrent requests',async()=>{
      const order=await Order.create({userId:customer._id,items:[{productId,name:'Audited device',sku:'AUDIT-1',price:125000,quantity:1,subtotal:125000}],shippingAddress:{fullName:'Buyer',phone:'0901234567',province:'HCM',ward:'Ward',detail:'QA street'},status:'DELIVERED',paymentMethod:'COD',totalAmount:125000});
      const payment=await Payment.create({orderId:order._id,userId:customer._id,amount:125000,method:'COD',status:'PENDING'});
      const results=await Promise.all([api('/admin/payments/orders/'+order.id+'/confirm','PATCH',undefined,access),api('/admin/payments/orders/'+order.id+'/confirm','PATCH',undefined,access)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal(await AuditEvent.countDocuments({action:'PAYMENT_CONFIRMED',targetId:payment.id}),1);
      assert.equal((await Payment.findById(payment.id))!.status,'PAID');
    });
    await t.test('audit failure rolls back provisioning and inventory changes; secrets never enter audit',async()=>{
      const create=AuditEvent.create,count=await AuditEvent.countDocuments(),stock=(await Product.findById(productId))!.stock;
      (AuditEvent as any).create=async()=>{throw new Error('Simulated unavailable audit store');};
      try {
        assert.equal((await api('/admin/users','POST',{...input,email:'rollback@test.local'},at)).status,500);
        assert.equal((await api('/admin/products/'+productId+'/stock','PATCH',{delta:1,reason:'Rollback when audit store unavailable'},access)).status,500);
        assert.equal((await api('/auth/change-password','POST',{currentPassword:newPassword,password:'ChangedDuringAuditFailure!2026'},access)).status,500);
      }finally{AuditEvent.create=create;}
      assert.equal(await User.exists({email:'rollback@test.local'}),null);assert.equal((await Product.findById(productId))!.stock,stock);
      assert.equal(await AuditEvent.countDocuments(),count);assert.equal(await StockMovement.countDocuments({productId}),1);
      assert.equal((await api('/auth/me','GET',undefined,access)).status,200);
      assert.ok(await bcrypt.compare(newPassword,(await User.findById(staffId).select('+passwordHash'))!.passwordHash));
      const serialized=JSON.stringify(await AuditEvent.find().lean());assert.ok(!serialized.includes(temporary));assert.ok(!serialized.includes(newPassword));assert.ok(!serialized.includes(hash));
    });
    await t.test('audit is admin-only, read-only, paginated and validates filters',async()=>{
      const list=await api('/admin/audit?action=PRODUCT_UPDATED&actorId='+staffId+'&targetId='+productId,'GET',undefined,at);
      assert.equal(list.status,200);assert.equal(list.body.pagination.total,1);assert.equal(list.body.data[0].actorId.email,input.email);
      for(const suffix of ['?page=0','?action=UNKNOWN','?actorId=invalid','?from=2026-02-30','?from=2026-11-08&to=2026-11-01','?page=1&page=2'])assert.equal((await api('/admin/audit'+suffix,'GET',undefined,at)).status,400,suffix);
      const id=list.body.data[0]._id;for(const method of ['POST','PATCH','DELETE'])assert.equal((await api('/admin/audit/'+id,method,{},at)).status,404);
      assert.equal((await api('/admin/audit','GET',undefined,access)).status,403);
    });
    await t.test('reissue only targets active staff, requires reason/reauth, and revokes tokens and challenges',async()=>{
      const reset={currentPassword:adminPassword,reason:'Nhân viên quên mật khẩu riêng'};
      assert.equal((await api('/admin/users/'+admin.id+'/temporary-password','POST',reset,at)).status,409);
      assert.equal((await api('/admin/users/'+customer.id+'/temporary-password','POST',reset,at)).status,409);
      assert.equal((await api('/admin/users/'+staffId+'/temporary-password','POST',{...reset,reason:'short'},at)).status,400);
      assert.equal((await api('/admin/users/'+staffId+'/temporary-password','POST',{...reset,currentPassword:'wrong'},at)).status,403);
      await AccountChallenge.create({userId:staffId,purpose:'RESET_PASSWORD',tokenHash:'a'.repeat(64),expiresAt:new Date(Date.now()+100000)});
      const r=await api('/admin/users/'+staffId+'/temporary-password','POST',reset,at);assert.equal(r.status,200);assert.notEqual(r.body.data.temporaryPassword,temporary);temporary=r.body.data.temporaryPassword;
      assert.equal((await api('/auth/me','GET',undefined,access)).status,401);assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:activeCookie})).status,401);
      assert.equal(await AccountChallenge.countDocuments({userId:staffId}),0);assert.equal((await User.findById(staffId))!.mustChangePassword,true);
      assert.equal(await AuditEvent.countDocuments({action:'TEMP_PASSWORD_ISSUED',targetId:staffId}),1);
    });
    await t.test('expired temporary passwords cannot login, refresh or complete setup',async()=>{
      const r=await api('/auth/login','POST',{email:input.email,password:temporary});assert.equal(r.status,200);
      await User.updateOne({_id:staffId},{$set:{temporaryPasswordExpiresAt:new Date(Date.now()-1000)}});
      assert.equal((await api('/auth/login','POST',{email:input.email,password:temporary})).status,403);
      assert.equal((await api('/auth/me','GET',undefined,r.body.data.accessToken)).body.code,'TEMP_PASSWORD_EXPIRED');
      assert.equal((await api('/auth/change-password','POST',{currentPassword:temporary,password:newPassword},r.body.data.accessToken)).status,403);
      assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:r.cookie!})).status,401);
    });
    await t.test('locking staff preserves history and blocks reissue; promotions enforce setup and revoke old tokens',async()=>{
      assert.equal((await api('/admin/users/'+staffId,'PATCH',{isActive:false},at)).status,200);
      assert.equal((await api('/admin/users/'+staffId+'/temporary-password','POST',{currentPassword:adminPassword,reason:'Không cấp lại khi tài khoản khóa'},at)).status,409);
      assert.ok(await AuditEvent.countDocuments({targetId:staffId})>=4);
      assert.equal((await api('/admin/users/'+customer.id,'PATCH',{role:'STAFF'},at)).status,200);
      assert.equal((await api('/auth/me','GET',undefined,ct)).status,401);
      const login=await api('/auth/login','POST',{email:customer.email,password:adminPassword});assert.equal(login.body.data.user.mustChangePassword,true);
      assert.equal((await api('/admin/orders','GET',undefined,login.body.data.accessToken)).body.code,'PASSWORD_CHANGE_REQUIRED');
      assert.equal((await api('/admin/users/'+admin.id,'PATCH',{isActive:false},at)).status,409);
    });
    await t.test('email recovery cannot bypass staff password strength and clears setup only with a valid one-use token',async()=>{
      const mails:Mail[]=[];setTestMailTransport(async mail=>{mails.push(mail);});
      await User.updateOne({_id:oldStaff.id},{$set:{mustChangePassword:true,temporaryPasswordExpiresAt:new Date(Date.now()+60000)}});
      assert.equal((await api('/auth/forgot-password','POST',{email:oldStaff.email})).status,202);
      const token=mails[0]!.text.match(/token=([a-f0-9]{64})/)![1];
      const original=await User.findById(oldStaff.id).select('+passwordHash');
      const samePassword=await api('/auth/reset-password','POST',{token,password:adminPassword});
      assert.equal(samePassword.status,400);assert.match(samePassword.body.message,/phải khác mật khẩu hiện tại/);
      assert.equal((await User.findById(oldStaff.id).select('+passwordHash'))!.passwordHash,original!.passwordHash);
      assert.equal((await api('/auth/reset-password','POST',{token,password:'short1234'})).status,400);
      assert.equal((await api('/auth/reset-password','POST',{token,password:'ộ'.repeat(25)})).status,400);
      assert.equal((await User.findById(oldStaff.id))!.mustChangePassword,true);
      assert.equal((await api('/auth/reset-password','POST',{token,password:'Recover123'})).status,200);
      const user=await User.findById(oldStaff.id);assert.equal(user!.mustChangePassword,false);assert.equal(user!.temporaryPasswordExpiresAt,null);
      assert.equal((await api('/auth/reset-password','POST',{token,password:'RecoveredAgain!2026'})).status,400);
      assert.equal((await api('/auth/me','GET',undefined,st)).status,401);
      assert.equal(await AuditEvent.countDocuments({action:'PASSWORD_RESET',targetId:oldStaff.id}),1);
      assert.ok(!JSON.stringify(await AuditEvent.find().lean()).includes(token));setTestMailTransport(undefined);
    });
  }finally{
    setTestMailTransport(undefined);
    process.env.EMAIL_VERIFICATION_REQUIRED='false';
    if(server)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    await mongoose.disconnect();await mongo.stop();
  }
});
