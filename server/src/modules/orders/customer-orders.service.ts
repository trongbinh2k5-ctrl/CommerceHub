import mongoose from 'mongoose';
import type {Request} from 'express';
import {Order,OrderStatus} from './order.model';
import {Payment,PaymentStatus} from '../payments/payment.model';
import {Cart} from '../cart/cart.model';
import {Product} from '../products/product.model';
import {Category} from '../categories/category.model';
import {listOrderRecords} from '../operations/list-query';
import {isValidIdempotencyKey} from './checkout-idempotency';
const reorderSchema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,required:true},orderId:{type:mongoose.Schema.Types.ObjectId,required:true},key:{type:String,required:true},createdAt:{type:Date,default:Date.now,expires:86400}});
reorderSchema.index({userId:1,key:1},{unique:true});
export const ReorderRequest=mongoose.model('ReorderRequest',reorderSchema);
const fail=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode});};
export async function browseCustomerOrders(userId:string,query:Request['query']){
 const view=query.view;
 if(typeof view!=='string'||!['all','unpaid','pending','shipping','delivered','cancelled','returns'].includes(view)||query.status!==undefined)return fail(400,'Bộ lọc đơn hàng không hợp lệ.');
 let filter:Record<string,unknown>={};
 if(view==='unpaid'||view==='pending'){
  const payments=await Payment.find({userId,status:view==='unpaid'?PaymentStatus.PENDING:PaymentStatus.PAID}).select('orderId').lean();
  const ids=payments.map(p=>p.orderId);
  filter=view==='unpaid'?{status:'PENDING',paymentMethod:{$ne:'COD'},_id:{$in:ids}}:{$or:[{status:'CONFIRMED'},{status:'PENDING',paymentMethod:'COD'},{status:'PENDING',_id:{$in:ids}}]};
 }else if(view!=='all')filter={status:({shipping:'SHIPPING',delivered:'DELIVERED',cancelled:'CANCELLED',returns:'RETURNED'} as Record<string,string>)[view]};
 return listOrderRecords(Order,query,Object.values(OrderStatus),userId,filter);
}
export async function reorder(userId:string,orderId:string,key:unknown){
 if(!/^[a-f\d]{24}$/i.test(orderId))return fail(400,'Mã đơn không hợp lệ.');
 if(!isValidIdempotencyKey(key))return fail(400,'Mã yêu cầu mua lại không hợp lệ.');
 const session=await mongoose.startSession();
 try{return await session.withTransaction(async()=>{
  const order=await Order.findOne({_id:orderId,userId}).session(session);
  if(!order)return fail(404,'Không tìm thấy đơn hàng.');
  const previous=await ReorderRequest.findOne({userId,key}).session(session);
  if(previous){if(String(previous.orderId)!==orderId)return fail(409,'Mã yêu cầu đã được dùng cho đơn khác.');return {message:'Đã thêm vào giỏ hàng.'};}
  if(!['DELIVERED','CANCELLED','RETURNED'].includes(order.status))return fail(409,'Chỉ mua lại đơn đã kết thúc.');
  let cart=await Cart.findOne({userId}).session(session);if(!cart)cart=new Cart({userId,items:[]});
  for(const item of order.items){
   const product=await Product.findOne({_id:item.productId,isActive:true,price:{$gt:0}}).session(session);
   if(!product)return fail(409,'Có sản phẩm đã ngừng bán. Giỏ hàng chưa thay đổi.');
   if(product.categoryId&&!(await Category.exists({_id:product.categoryId,isActive:true}).session(session)))return fail(409,'Có sản phẩm không còn bán. Giỏ hàng chưa thay đổi.');
   const existing=cart.items.find(i=>String(i.productId)===String(item.productId));const quantity=(existing?.quantity||0)+item.quantity;
   if(quantity>99||quantity>product.stock)return fail(409,'Số lượng vượt tồn kho hoặc giới hạn. Giỏ hàng chưa thay đổi.');
   if(existing)existing.quantity=quantity;else cart.items.push({productId:item.productId,quantity});
  }
  await cart.save({session});await ReorderRequest.create([{userId,orderId,key}],{session});return {message:'Đã thêm vào giỏ hàng.'};
 });}catch(e:any){if(e?.code===11000||e?.name==='VersionError')return fail(409,'Giỏ hàng vừa thay đổi. Vui lòng tải lại.');throw e;}finally{await session.endSession();}
}
