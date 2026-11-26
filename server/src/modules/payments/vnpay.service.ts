import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import mongoose from 'mongoose';
import { Order, OrderStatus, PaymentMethod } from '../orders/order.model';
import { Payment, PaymentStatus } from './payment.model';
import { PaymentError } from './payment.service';
import { VnpayAttempt } from './vnpay.model';
import { canonicalVnpay, sandboxUrl, signVnpay, verifyVnpay, vnpayConfig, vnpayDate } from './vnpay.config';
import { Notification } from '../operations/operations.models';

export async function createVnpayPayment(userId:string, orderId:string, ip:string) {
  const config = vnpayConfig();
  if (!config) throw new PaymentError(503,'VNPAY sandbox chưa được cấu hình.');
  const session = await mongoose.startSession();
  try { return await session.withTransaction(async () => {
    // Write-lock the order as well as payment, serializing checkout against cancellation.
    const order = await Order.findOneAndUpdate({_id:orderId,userId,status:OrderStatus.PENDING,paymentMethod:PaymentMethod.VNPAY},{$inc:{__v:1}},{returnDocument:'after',session});
    if (!order) throw new PaymentError(409,'Đơn không thể thanh toán hoặc không thuộc tài khoản của bạn.');
    const payment = await Payment.findOne({orderId,userId,method:PaymentMethod.VNPAY,status:PaymentStatus.PENDING}).session(session);
    if (!payment || payment.amount !== order.totalAmount || !Number.isSafeInteger(payment.amount*100) || payment.amount < 5000) throw new PaymentError(409,'Số tiền thanh toán không hợp lệ (tối thiểu 5.000đ).');
    if (payment.activeVnpayRef) {
      const existing = await VnpayAttempt.findOne({ref:payment.activeVnpayRef,status:'PENDING'}).select('+url').session(session);
      if (!existing || existing.expiresAt <= new Date()) throw new PaymentError(409,'Giao dịch đang chờ đối soát. Không tạo giao dịch mới để tránh thanh toán hai lần; vui lòng liên hệ cửa hàng.');
      return {url:existing.url,expiresAt:existing.expiresAt};
    }
    const now = new Date(), expiresAt = new Date(now.getTime()+15*60*1000);
    const ref = randomBytes(16).toString('hex');
    const params:Record<string,string> = {vnp_Version:'2.1.0',vnp_Command:'pay',vnp_TmnCode:config.tmnCode,vnp_Amount:String(payment.amount*100),vnp_CurrCode:'VND',vnp_TxnRef:ref,vnp_OrderInfo:`Thanh toan BerylCore ${orderId}`,vnp_OrderType:'other',vnp_Locale:'vn',vnp_ReturnUrl:config.returnUrl,vnp_IpAddr:isIP(ip)?ip:'127.0.0.1',vnp_CreateDate:vnpayDate(now),vnp_ExpireDate:vnpayDate(expiresAt)};
    const url = `${sandboxUrl}?${canonicalVnpay(params)}&vnp_SecureHash=${signVnpay(params,config.secret)}`;
    await VnpayAttempt.create([{ref,orderId,userId,amount:payment.amount,expiresAt,url}],{session});
    payment.activeVnpayRef=ref; await payment.save({session});
    return {url,expiresAt};
  }); } finally { await session.endSession(); }
}

export async function receiveVnpayIpn(query:unknown) {
  const config = vnpayConfig();
  if (!config) return {RspCode:'99',Message:'Not configured'};
  const p = verifyVnpay(query,config.secret);
  if (!p || p.vnp_TmnCode !== config.tmnCode) return {RspCode:'97',Message:'Invalid signature'};
  return applyVerifiedResult(p);
}

async function applyVerifiedResult(p:Record<string,string>) {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(async () => {
    const attempt = await VnpayAttempt.findOne({ref:p.vnp_TxnRef}).session(session);
    if (!attempt) return {RspCode:'01',Message:'Order not found'};
    if (p.vnp_Amount !== String(attempt.amount*100)) return {RspCode:'04',Message:'Invalid amount'};
    if (attempt.status !== 'PENDING') return {RspCode:'02',Message:'Already confirmed'};
    if (!/^\d{2}$/.test(p.vnp_ResponseCode || '') || !/^\d{2}$/.test(p.vnp_TransactionStatus || '')) return {RspCode:'99',Message:'Invalid result'};
    if (!['00','02'].includes(p.vnp_TransactionStatus) || (p.vnp_TransactionStatus==='00' && p.vnp_ResponseCode!=='00')) return {RspCode:'99',Message:'Reconciliation required'};
    const payment = await Payment.findOne({orderId:attempt.orderId,userId:attempt.userId,activeVnpayRef:attempt.ref,status:PaymentStatus.PENDING,method:PaymentMethod.VNPAY,amount:attempt.amount}).session(session);
    const order = await Order.findOne({_id:attempt.orderId,userId:attempt.userId,status:OrderStatus.PENDING,paymentMethod:PaymentMethod.VNPAY,totalAmount:attempt.amount}).session(session);
    if (!payment || !order) return {RspCode:'99',Message:'Reconciliation required'};
    const paid = p.vnp_ResponseCode==='00' && p.vnp_TransactionStatus==='00';
    if (paid && !/^\d{1,15}$/.test(p.vnp_TransactionNo || '')) return {RspCode:'99',Message:'Invalid transaction'};
    attempt.status=paid?'PAID':'FAILED'; attempt.responseCode=p.vnp_ResponseCode; attempt.transactionNo=p.vnp_TransactionNo;
    await attempt.save({session});
    payment.activeVnpayRef=null;
    if (paid) {
      payment.status=PaymentStatus.PAID; payment.paidAt=new Date(); payment.gatewayTransactionNo=p.vnp_TransactionNo;
      await Notification.create([{userId:order.userId,title:'Thanh toán VNPAY thành công',message:'Đã nhận xác nhận thanh toán sandbox cho đơn hàng.',href:`/orders/${order.id}`,dedupeKey:`payment:${payment.id}:PAID`}],{session});
    }
    await payment.save({session});
    return {RspCode:'00',Message:'Confirm Success'};
  }); } finally { await session.endSession(); }
}

// Query the gateway when IPN is delayed. A timeout/unknown result never releases the payment lock.
export async function reconcileVnpay(userId:string,orderId:string,ip:string) {
  const config=vnpayConfig();
  if(!config)throw new PaymentError(503,'VNPAY sandbox chưa được cấu hình.');
  const payment=await Payment.findOne({orderId,userId,method:PaymentMethod.VNPAY}).lean();
  if(!payment)throw new PaymentError(404,'Không tìm thấy thanh toán.');
  if(!payment.activeVnpayRef)return {message:payment.status==='PAID'?'Đơn đã thanh toán.':'Chưa có giao dịch đang chờ xác nhận.'};
  const attempt=await VnpayAttempt.findOne({ref:payment.activeVnpayRef,userId}).select('+url').lean();
  if(!attempt)throw new PaymentError(409,'Cần đối soát giao dịch với cửa hàng.');
  const req:Record<string,string>={vnp_RequestId:randomBytes(16).toString('hex'),vnp_Version:'2.1.0',vnp_Command:'querydr',vnp_TmnCode:config.tmnCode,vnp_TxnRef:attempt.ref,vnp_OrderInfo:`Kiem tra BerylCore ${orderId}`,vnp_TransactionDate:new URL(attempt.url).searchParams.get('vnp_CreateDate')!,vnp_CreateDate:vnpayDate(new Date()),vnp_IpAddr:isIP(ip)?ip:'127.0.0.1'};
  const requestFields=['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TxnRef','vnp_TransactionDate','vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'];
  req.vnp_SecureHash=createHmac('sha512',config.secret).update(requestFields.map(k=>req[k]).join('|')).digest('hex');
  let p:Record<string,string>;
  try {
    const response=await fetch('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error();
    const raw:unknown=await response.json();
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error();
    p={};for(const [key,value] of Object.entries(raw)){if(typeof value!=='string'||value.length>4096)throw new Error();p[key]=value;}
  }catch{throw new PaymentError(502,'Chưa truy vấn được VNPAY. Giữ nguyên trạng thái; vui lòng thử lại sau.');}
  const fields=['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode','vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo','vnp_TransactionType','vnp_TransactionStatus','vnp_OrderInfo','vnp_PromotionCode','vnp_PromotionAmount'];
  const expected=createHmac('sha512',config.secret).update(fields.map(k=>p[k]||'').join('|')).digest();
  if(!/^[a-fA-F0-9]{128}$/.test(p.vnp_SecureHash||'')||!timingSafeEqual(expected,Buffer.from(p.vnp_SecureHash,'hex'))||p.vnp_TmnCode!==config.tmnCode||p.vnp_TxnRef!==attempt.ref||p.vnp_Command!=='querydr')throw new PaymentError(502,'Phản hồi đối soát không hợp lệ.');
  // ResponseCode is the query result, TransactionStatus is the payment result.
  if(p.vnp_ResponseCode!=='00'||!['00','02'].includes(p.vnp_TransactionStatus)||p.vnp_TransactionType!=='01')return {message:'VNPAY chưa xác nhận trạng thái thanh toán cuối cùng. Vui lòng chờ hoặc liên hệ cửa hàng.'};
  const result=await applyVerifiedResult({...p,vnp_ResponseCode:p.vnp_TransactionStatus==='00'?'00':'99'});
  if(!['00','02'].includes(result?.RspCode||''))throw new PaymentError(409,'Giao dịch cần đối soát với cửa hàng.');
  return {message:p.vnp_TransactionStatus==='00'?'Đã xác nhận thanh toán.':'Giao dịch không thành công. Bạn có thể thử lại hoặc hủy đơn.'};
}
