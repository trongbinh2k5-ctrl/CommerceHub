import mongoose from 'mongoose';
import {Payment,PaymentStatus} from './payment.model';
import {Order,OrderStatus} from '../orders/order.model';
import {Notification} from '../operations/operations.models';
import {recordAudit} from '../operations/audit.service';
import {PaymentError} from './payment.service';

// Records an already completed external transfer. Never initiates a transfer.
export async function confirmManualRefund(orderId:string,actorId:string,input:unknown){
 if(!/^[a-f\d]{24}$/i.test(orderId))throw new PaymentError(400,'Mã đơn không hợp lệ.');
 const b=input as Record<string,unknown>;
 if(!b||b.confirmed!==true||!Number.isSafeInteger(b.amount)||typeof b.reference!=='string'||!/^[\p{L}\p{N} ._/-]{6,120}$/u.test(b.reference.trim()))throw new PaymentError(400,'Cần số tiền, mã giao dịch hoàn tiền và xác nhận đã chuyển tiền.');
 const reference=b.reference.trim();const session=await mongoose.startSession();
 try{return await session.withTransaction(async()=>{
  const order=await Order.findById(orderId).session(session);
  const p=await Payment.findOne({orderId}).session(session);
  if(!order||!p)throw new PaymentError(404,'Không tìm thấy thanh toán.');
  if(order.status!==OrderStatus.CANCELLED||p.status!==PaymentStatus.PAID||p.amount!==order.totalAmount||String(p.userId)!==String(order.userId)||p.method!==order.paymentMethod||p.activeSepayRef||p.activeVnpayRef)throw new PaymentError(409,'Đơn chưa đủ điều kiện xác nhận hoàn tiền.');
  if(p.refundStatus==='COMPLETED'){
   if(p.refundReference===reference&&p.refundAmount===b.amount)return p;
   throw new PaymentError(409,'Đơn đã được xác nhận hoàn tiền.');
  }
  if(!['REQUESTED','PROCESSING'].includes(p.refundStatus||'')||b.amount!==p.amount)throw new PaymentError(409,'Số tiền phải bằng toàn bộ khoản đã thanh toán.');
  if(p.refundRecipientSubmittedAt&&p.refundStatus!=='PROCESSING')throw new PaymentError(409,'Hãy tiếp nhận yêu cầu trong mục Hoàn tiền trước.');
  const previousRefundStatus=p.refundStatus||null;
  p.refundStatus='COMPLETED';p.refundAmount=p.amount;p.refundReference=reference;p.refundedAt=new Date();p.refundConfirmedBy=new mongoose.Types.ObjectId(actorId);
  await p.save({session});
  await Notification.create([{userId:order.userId,title:'Đã hoàn tiền',message:`Đã hoàn ${p.amount.toLocaleString('vi-VN')} ₫ cho đơn #${order.id.slice(-8)}.`,href:'/orders/'+order.id,dedupeKey:'refund:'+p.id}],{session});
  await recordAudit(actorId,'REFUND_CONFIRMED','PAYMENT',p.id,'Xác nhận đã hoàn tiền thực tế.',[{field:'refundStatus',before:previousRefundStatus,after:'COMPLETED'},{field:'amount',before:0,after:p.amount}],session);
  return p;
 });}catch(e:any){if(e?.code===11000)throw new PaymentError(409,'Mã giao dịch hoàn tiền đã được sử dụng.');throw e;}finally{await session.endSession();}
}
