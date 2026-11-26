import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { SupportRequest, Notification, StockMovement } from './operations.models';
import { Order, OrderStatus } from '../orders/order.model';
import { isValidProductImage } from '../products/product-image';
const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
const pageOf = (value: unknown) => { const p = value === undefined ? 1 : Number(value); if (!Number.isSafeInteger(p) || p < 1 || p > 1000000) return fail(400, 'Trang không hợp lệ.'); return p; };
export const supportRouter = Router(); supportRouter.use(authenticate, authorize('CUSTOMER'));
supportRouter.get('/', async (req,res) => { const page=pageOf(req.query.page); const filter={userId:req.user!.userId}; const [data,total]=await Promise.all([SupportRequest.find(filter).populate('productId','name imageUrl').sort({createdAt:-1}).skip((page-1)*20).limit(20).lean(),SupportRequest.countDocuments(filter)]);res.json({success:true,data,pagination:{page,total,totalPages:Math.ceil(total/20)}}); });
supportRouter.post('/', async(req,res)=>{
  const b=req.body??{};
  if(!mongoose.isValidObjectId(b.orderId)||!mongoose.isValidObjectId(b.productId)||!['RETURN','WARRANTY'].includes(b.type)||!Number.isSafeInteger(b.quantity)||b.quantity<1||typeof b.reason!=='string'||b.reason.trim().length<10||b.reason.length>3000|| (b.images!==undefined&&(!Array.isArray(b.images)||b.images.length>5||b.images.some((v:unknown)=>!v||!isValidProductImage(v))))) return fail(400,'Yêu cầu chưa hợp lệ. Hãy mô tả ít nhất 10 ký tự và chọn sản phẩm đã mua.');
  const order=await Order.findOne({_id:b.orderId,userId:req.user!.userId,status:OrderStatus.DELIVERED});
  const item=order?.items.find(i=>String(i.productId)===String(b.productId));
  if(!item||b.quantity>item.quantity)return fail(409,'Chỉ gửi yêu cầu cho sản phẩm trong đơn đã giao, không quá số lượng đã mua.');
  try {
    const data=await SupportRequest.create({userId:req.user!.userId,orderId:order!._id,productId:item.productId,type:b.type,quantity:b.quantity,reason:b.reason.trim(),images:b.images||[],events:[{status:'PENDING',note:'Khách hàng gửi yêu cầu.',actorId:req.user!.userId}]});
    res.status(201).json({success:true,data});
  }catch(e:any){if(e?.code===11000)return fail(409,'Sản phẩm đã có yêu cầu cùng loại đang xử lý.');throw e;}
});
export const adminSupportRouter=Router();adminSupportRouter.use(authenticate,authorize('STAFF','ADMIN'));
adminSupportRouter.get('/',async(req,res)=>{const page=pageOf(req.query.page);const filter:any=req.query.status?{status:String(req.query.status)}:{};const [data,total]=await Promise.all([SupportRequest.find(filter).populate('productId','name').populate('userId','fullName email').sort({createdAt:-1}).skip((page-1)*30).limit(30).lean(),SupportRequest.countDocuments(filter)]);res.json({success:true,data,pagination:{page,total,totalPages:Math.ceil(total/30)}});});
adminSupportRouter.patch('/:id',async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)||typeof req.body?.response!=='string'||!req.body.response.trim()||req.body.response.length>3000)return fail(400,'Cần phản hồi rõ ràng, tối đa 3000 ký tự.');
  const transitions:Record<string,string[]>={PENDING:['APPROVED','REJECTED'],APPROVED:['IN_PROGRESS','RESOLVED'],IN_PROGRESS:['RESOLVED']};
  const session=await mongoose.startSession();let result;
  try{await session.withTransaction(async()=>{
    const request=await SupportRequest.findById(req.params.id).session(session);if(!request)return fail(404,'Không tìm thấy yêu cầu.');
    if(!transitions[request.status]?.includes(req.body.status))return fail(409,'Không thể chuyển sang trạng thái này.');
    request.status=req.body.status;request.response=req.body.response.trim();request.open=!['REJECTED','RESOLVED'].includes(req.body.status);request.events.push({status:req.body.status,note:request.response,actorId:new mongoose.Types.ObjectId(req.user!.userId),createdAt:new Date()});await request.save({session});
    await Notification.create([{userId:request.userId,title:'Cập nhật yêu cầu sau mua',message:request.response,href:'/account?tab=support',dedupeKey:`support:${request.id}:${request.status}`}],{session});result=request;
  });res.json({success:true,data:result});}finally{await session.endSession();}
});
export const notificationRouter=Router();notificationRouter.use(authenticate);
notificationRouter.get('/',async(req,res)=>{const page=pageOf(req.query.page);const filter={userId:req.user!.userId};const [data,total,unread]=await Promise.all([Notification.find(filter).sort({createdAt:-1}).skip((page-1)*30).limit(30).lean(),Notification.countDocuments(filter),Notification.countDocuments({...filter,readAt:null})]);res.json({success:true,data,pagination:{page,total,totalPages:Math.ceil(total/30)},unread});});
notificationRouter.patch('/read',async(req,res)=>{await Notification.updateMany({userId:req.user!.userId,readAt:null},{$set:{readAt:new Date()}});res.json({success:true,data:null});});
notificationRouter.patch('/:id/read',async(req,res)=>{
 if(typeof req.params.id!=='string'||!/^[a-f\d]{24}$/i.test(req.params.id))return fail(400,'Mã thông báo không hợp lệ.');
 const exists=await Notification.exists({_id:req.params.id,userId:req.user!.userId});if(!exists)return fail(404,'Không tìm thấy thông báo.');
 await Notification.updateOne({_id:req.params.id,userId:req.user!.userId,readAt:null},{$set:{readAt:new Date()}});res.json({success:true,data:null});
});
export const inventoryRouter=Router();inventoryRouter.use(authenticate,authorize('STAFF','ADMIN'));
inventoryRouter.get('/',async(req,res)=>{const page=pageOf(req.query.page);if(req.query.productId&&!mongoose.isValidObjectId(req.query.productId))return fail(400,'Mã sản phẩm không hợp lệ.');const filter:any=req.query.productId?{productId:req.query.productId}:{};const [data,total]=await Promise.all([StockMovement.find(filter).populate('productId','name sku').populate('actorId','fullName').sort({createdAt:-1}).skip((page-1)*50).limit(50).lean(),StockMovement.countDocuments(filter)]);res.json({success:true,data,pagination:{page,total,totalPages:Math.ceil(total/50)}});});
