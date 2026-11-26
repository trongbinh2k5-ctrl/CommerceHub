import { Router } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { createRequestLimiter } from '../../middlewares/security.middleware';
import { User } from './user.model';
import { LoginSession, AccountChallenge } from './account.models';
import { validEmail } from './account.service';
import { recordAudit, auditChanges } from '../operations/audit.service';
const fields='fullName email phone role isActive emailVerifiedAt mustChangePassword temporaryPasswordExpiresAt createdAt';
const fail=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode});};
const temporaryCredential=()=>({password:'CH!'+randomBytes(18).toString('base64url'),expiresAt:new Date(Date.now()+86400000)});
async function verifyAdmin(userId:string,password:unknown) {
  if(typeof password!=='string'||!password||Buffer.byteLength(password)>72)return fail(400,'Nhập mật khẩu hiện tại của admin để xác nhận.');
  const admin=await User.findOne({_id:userId,role:'ADMIN',isActive:true}).select('+passwordHash');
  if(!admin||!await bcrypt.compare(password,admin.passwordHash))return fail(403,'Mật khẩu xác nhận của admin không đúng.');
  return admin;
}
async function recheckAdmin(admin:any,session:mongoose.ClientSession) {
  if(!await User.exists({_id:admin._id,role:'ADMIN',isActive:true,passwordHash:admin.passwordHash,$or:[{authVersion:admin.authVersion||0},...(admin.authVersion?[ ]:[{authVersion:{$exists:false}}])]}).session(session))return fail(409,'Phiên admin đã thay đổi. Vui lòng đăng nhập lại.');
}
export const adminUserRouter=Router();
adminUserRouter.use(authenticate,authorize('ADMIN'));
adminUserRouter.get('/',async(req,res)=>{
  const page=Number(req.query.page??1),search=req.query.search,role=req.query.role;
  if(!Number.isSafeInteger(page)||page<1||page>1000000||(req.query.page!==undefined&&typeof req.query.page!=='string')||(search!==undefined&&(typeof search!=='string'||search.length>100))||(role!==undefined&&(typeof role!=='string'||!['CUSTOMER','STAFF','ADMIN'].includes(role))))return fail(400,'Bộ lọc không hợp lệ.');
  const escaped=typeof search==='string'?search.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):'';
  const filter:any={...(role?{role}:{}),...(escaped?{$or:[{fullName:new RegExp(escaped,'i')},{email:new RegExp(escaped,'i')}]}:{})};
  const [data,total]=await Promise.all([User.find(filter).select(fields).sort({createdAt:-1,_id:-1}).skip((page-1)*30).limit(30).lean(),User.countDocuments(filter)]);
  res.json({success:true,data,pagination:{page,total,totalPages:Math.ceil(total/30)}});
});
adminUserRouter.post('/',createRequestLimiter(10,15*60000),async(req,res)=>{
  const b=req.body??{};
  if(typeof b.fullName!=='string'||!b.fullName.trim()||b.fullName.trim().length>100||!validEmail(b.email)||(b.phone!==undefined&&(typeof b.phone!=='string'||(b.phone!==''&&!/^0\d{9}$/.test(b.phone))))||(b.role!==undefined&&b.role!=='STAFF')||b.password!==undefined)return fail(400,'Thông tin nhân viên không hợp lệ. Tài khoản tạo tại đây chỉ có quyền STAFF.');
  const admin=await verifyAdmin(req.user!.userId,b.currentPassword);
  const credential=temporaryCredential(),passwordHash=await bcrypt.hash(credential.password,12),session=await mongoose.startSession();
  try {
    const user=await session.withTransaction(async()=>{
      await recheckAdmin(admin,session);
      const [u]=await User.create([{fullName:b.fullName.trim(),email:b.email.trim().toLowerCase(),phone:b.phone||'',role:'STAFF',passwordHash,mustChangePassword:true,temporaryPasswordExpiresAt:credential.expiresAt,provisionedBy:admin._id}],{session});
      await recordAudit(admin._id,'STAFF_CREATED','USER',u!._id,'Admin tạo nhân viên; yêu cầu đổi mật khẩu.',auditChanges(null,u,['fullName','email','role','isActive','mustChangePassword']),session);return u!;
    });
    res.status(201).json({success:true,data:{user:{id:user!.id,fullName:user!.fullName,email:user!.email,role:user!.role,mustChangePassword:true},temporaryPassword:credential.password,expiresAt:credential.expiresAt}});
  }catch(e:any){if(e?.code===11000)return fail(409,'Email đã có tài khoản. Không tạo mới hoặc tự nâng quyền tài khoản này.');throw e;}
  finally{await session.endSession();}
});
adminUserRouter.post('/:id/temporary-password',createRequestLimiter(10,15*60000),async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)||typeof req.body?.reason!=='string'||req.body.reason.trim().length<10||req.body.reason.length>500)return fail(400,'Cần tài khoản hợp lệ và lý do cấp lại từ 10 đến 500 ký tự.');
  const admin=await verifyAdmin(req.user!.userId,req.body.currentPassword);
  const credential=temporaryCredential(),passwordHash=await bcrypt.hash(credential.password,12),session=await mongoose.startSession();
  try {
    const user=await session.withTransaction(async()=>{
      await recheckAdmin(admin,session);
      const u=await User.findOneAndUpdate({_id:req.params.id,role:'STAFF',isActive:true},{$set:{passwordHash,mustChangePassword:true,temporaryPasswordExpiresAt:credential.expiresAt},$inc:{authVersion:1}},{returnDocument:'after',session,runValidators:true});
      if(!u)return fail(409,'Chỉ cấp lại cho nhân viên đang hoạt động. Không thay đổi tài khoản admin.');
      await LoginSession.deleteMany({userId:u._id},{session});await AccountChallenge.deleteMany({userId:u._id},{session});
      await recordAudit(admin._id,'TEMP_PASSWORD_ISSUED','USER',u._id,req.body.reason.trim(),[],session);return u;
    });
    res.json({success:true,data:{user:{id:user!.id,fullName:user!.fullName,email:user!.email,role:user!.role,mustChangePassword:true},temporaryPassword:credential.password,expiresAt:credential.expiresAt}});
  }finally{await session.endSession();}
});
adminUserRouter.patch('/:id',async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id))return fail(400,'Tài khoản không hợp lệ.');
  if(String(req.params.id)===req.user!.userId)return fail(409,'Không thay đổi quyền hoặc khóa chính mình.');
  const data:Record<string,unknown>={};
  if(req.body?.role!==undefined){if(!['CUSTOMER','STAFF'].includes(req.body.role))return fail(400,'Chỉ cấp vai trò khách hàng hoặc nhân viên tại đây.');data.role=req.body.role;}
  if(req.body?.isActive!==undefined){if(typeof req.body.isActive!=='boolean')return fail(400,'Trạng thái không hợp lệ.');data.isActive=req.body.isActive;}
  if(!Object.keys(data).length)return fail(400,'Chưa có thay đổi hợp lệ.');
  const session=await mongoose.startSession();
  try {
    const user=await session.withTransaction(async()=>{
      const before=await User.findOne({_id:req.params.id,role:{$ne:'ADMIN'}}).session(session);
      if(!before)return fail(409,'Không thể thay đổi tài khoản quản trị hoặc tài khoản không tồn tại.');
      if(data.role==='STAFF'&&before.role!=='STAFF')data.mustChangePassword=true;
      const changes=auditChanges(before,{...before.toObject(),...data},['role','isActive','mustChangePassword']);
      if(!changes.length)return before;
      const u=await User.findOneAndUpdate({_id:before._id,role:{$ne:'ADMIN'}},{$set:data,$inc:{authVersion:1}},{returnDocument:'after',session,runValidators:true});
      await LoginSession.deleteMany({userId:before._id},{session});await AccountChallenge.deleteMany({userId:before._id},{session});
      await recordAudit(req.user!.userId,'ACCOUNT_UPDATED','USER',before._id,'Thay đổi quyền hoặc trạng thái tài khoản.',changes,session);return u!;
    });
    const result:any={_id:user!._id};for(const field of fields.split(' '))result[field]=(user as any)[field];
    res.json({success:true,data:result});
  }finally{await session.endSession();}
});
