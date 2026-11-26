import mongoose from 'mongoose';
import {Payment,PaymentStatus} from './payment.model';
import {Order,OrderStatus} from '../orders/order.model';
import {PaymentError} from './payment.service';
import {Notification} from '../operations/operations.models';
import {recordAudit} from '../operations/audit.service';
const validateId=(id:string)=>{if(!/^[a-f\d]{24}$/i.test(id))throw new PaymentError(400,'Mã đơn không hợp lệ.');};
export async function getRefundRecipient(userId:string,orderId:string){
 validateId(orderId);
 const p=await Payment.findOne({orderId,userId,refundStatus:{$in:['REQUESTED','PROCESSING','COMPLETED']}}).select('+refundRecipient').lean();
 if(!p)throw new PaymentError(404,'Không tìm thấy yêu cầu hoàn tiền.');
 return {recipient:p.refundRecipient,submittedAt:p.refundRecipientSubmittedAt};
}
export async function saveRefundRecipient(userId:string,orderId:string,input:unknown){
 validateId(orderId);const b=input as Record<string,unknown>;
 if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['bankName','accountNumber','accountHolder'].includes(k))||typeof b.bankName!=='string'||typeof b.accountNumber!=='string'||typeof b.accountHolder!=='string')throw new PaymentError(400,'Điền đủ thông tin nhận tiền.');
 const recipient={bankName:b.bankName.trim(),accountNumber:b.accountNumber.trim(),accountHolder:b.accountHolder.trim().replace(/\s+/g,' ').toLocaleUpperCase('vi-VN')};
 if(!/^[\p{L}\p{N} .&/-]{2,80}$/u.test(recipient.bankName)||!/^\d{6,30}$/.test(recipient.accountNumber)||! /^[\p{L}\p{M} .'-]{2,100}$/u.test(recipient.accountHolder))throw new PaymentError(400,'Kiểm tra ngân hàng, số tài khoản và tên chủ tài khoản.');
 const session=await mongoose.startSession();
 try{return await session.withTransaction(async()=>{
  const p=await Payment.findOne({orderId,userId}).select('+refundRecipient').session(session);
  const order=await Order.findOne({_id:orderId,userId,status:OrderStatus.CANCELLED}).session(session);
  if(!p||!order)throw new PaymentError(404,'Không tìm thấy yêu cầu hoàn tiền.');
  if(p.status!==PaymentStatus.PAID||p.refundStatus!=='REQUESTED'||p.amount!==order.totalAmount||p.method!==order.paymentMethod)throw new PaymentError(409,'Yêu cầu đã được tiếp nhận hoặc hoàn tất.');
  p.refundRecipient=recipient;p.refundRecipientSubmittedAt=new Date();await p.save({session});
  return {recipient,submittedAt:p.refundRecipientSubmittedAt};
 });}finally{await session.endSession();}
}
export async function startManualRefund(orderId:string,actorId:string){
 validateId(orderId);const session=await mongoose.startSession();
 try{return await session.withTransaction(async()=>{
  const p=await Payment.findOne({orderId}).select('+refundRecipient').session(session);
  const order=await Order.findById(orderId).session(session);
  if(!p||!order)throw new PaymentError(404,'Không tìm thấy yêu cầu hoàn tiền.');
  if(order.status!==OrderStatus.CANCELLED||p.status!==PaymentStatus.PAID||String(p.userId)!==String(order.userId)||p.amount!==order.totalAmount||p.method!==order.paymentMethod||p.activeSepayRef||p.activeVnpayRef)throw new PaymentError(409,'Đơn chưa đủ điều kiện hoàn tiền.');
  if(p.refundStatus==='PROCESSING')return {status:p.refundStatus,processingAt:p.refundProcessingAt};
  if(p.refundStatus!=='REQUESTED'||!p.refundRecipient)throw new PaymentError(409,'Chờ khách gửi thông tin nhận tiền.');
  p.refundStatus='PROCESSING';p.refundProcessingAt=new Date();await p.save({session});
  await Notification.create([{userId:order.userId,title:'Đang xử lý hoàn tiền',message:`Cửa hàng đã tiếp nhận hoàn tiền đơn #${order.id.slice(-8)}.`,href:'/orders/'+order.id,dedupeKey:'refund-processing:'+p.id}],{session});
  await recordAudit(actorId,'REFUND_STARTED','PAYMENT',p.id,'Tiếp nhận hoàn tiền thủ công.',[{field:'refundStatus',before:'REQUESTED',after:'PROCESSING'}],session);
  return {status:p.refundStatus,processingAt:p.refundProcessingAt};
 });}finally{await session.endSession();}
}
export async function listRefundQueue(query:Record<string,unknown>){
 if((query.page!==undefined&&typeof query.page!=='string')||(query.status!==undefined&&typeof query.status!=='string'))throw new PaymentError(400,'Bộ lọc không hợp lệ.');
 const page=Number(query.page||1),status=query.status||'pending';
 if(!Number.isSafeInteger(page)||page<1||page>100000||!['pending','REQUESTED','PROCESSING','COMPLETED'].includes(String(status)))throw new PaymentError(400,'Bộ lọc không hợp lệ.');
 const refundStatus=status==='pending'?{$in:['REQUESTED','PROCESSING']}:status;
 const [result]=await Payment.aggregate([
  {$match:{status:PaymentStatus.PAID,refundStatus}},
  {$lookup:{from:'orders',localField:'orderId',foreignField:'_id',as:'order'}},{$unwind:'$order'},
  {$match:{'order.status':OrderStatus.CANCELLED,$expr:{$and:[{$eq:['$userId','$order.userId']},{$eq:['$amount','$order.totalAmount']},{$eq:['$method','$order.paymentMethod']}]}}},
  {$facet:{data:[{$sort:{refundRequestedAt:1,_id:1}},{$skip:(page-1)*20},{$limit:20},{$project:{_id:1,orderId:1,customerName:'$order.shippingAddress.fullName',amount:1,status:1,refundStatus:1,refundRequestedAt:1,refundProcessingAt:1,refundRecipientSubmittedAt:1,refundRecipient:1,refundedAt:1,refundAmount:1,refundReference:1}}],total:[{$count:'count'}]}}
 ]);
 const total=result?.total[0]?.count||0;return {data:result?.data||[],pagination:{page,total,totalPages:Math.ceil(total/20)}};
}
