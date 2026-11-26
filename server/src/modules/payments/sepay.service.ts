import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { Order,OrderStatus,PaymentMethod } from '../orders/order.model';
import { Payment,PaymentStatus } from './payment.model';
import { PaymentError } from './payment.service';
import { SepayAttempt } from './sepay.model';
import { sepayAmount,sepayApiUrl,sepayConfig,sepayForm,sepayReturnOrigin } from './sepay.config';
import { Notification } from '../operations/operations.models';

function requiredConfig(){const config=sepayConfig();if(!config)throw new PaymentError(503,'SePay chưa được cấu hình đầy đủ.');return config;}
type Data=Record<string,unknown>;
function object(value:unknown):Data{if(!value||typeof value!=='object'||Array.isArray(value))throw new PaymentError(400,'Dữ liệu SePay không hợp lệ.');return value as Data;}
function identifier(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new PaymentError(400,'Mã giao dịch SePay không hợp lệ.');return value;}

export async function createSepayPayment(userId:string,orderId:string,originInput?:unknown){
  const config=requiredConfig(),session=await mongoose.startSession();
  try{return await session.withTransaction(async()=>{
    const returnOrigin=originInput===undefined?undefined:sepayReturnOrigin(originInput,config);
    if(returnOrigin===null)throw new PaymentError(400,'Địa chỉ quay về không được phép.');
    const order=await Order.findOneAndUpdate({_id:orderId,userId,status:OrderStatus.PENDING,paymentMethod:PaymentMethod.SEPAY},{$inc:{__v:1}},{returnDocument:'after',session});
    if(!order)throw new PaymentError(409,'Đơn không thể thanh toán hoặc không thuộc tài khoản của bạn.');
    const payment=await Payment.findOne({orderId,userId,method:PaymentMethod.SEPAY,status:PaymentStatus.PENDING}).session(session);
    if(!payment||payment.amount!==order.totalAmount||!Number.isSafeInteger(payment.amount)||payment.amount<1)throw new PaymentError(409,'Số tiền thanh toán không hợp lệ.');
    if(payment.activeSepayRef){
      const attempt=await SepayAttempt.findOne({ref:payment.activeSepayRef,status:'PENDING',merchantId:config.merchantId,orderId,userId,amount:payment.amount}).session(session);
      if(!attempt)throw new PaymentError(409,'Giao dịch cần đối soát với cửa hàng.');
      if(returnOrigin){attempt.returnOrigin=returnOrigin;await attempt.save({session});}
      return sepayForm(config,attempt.ref,attempt.amount,attempt.returnOrigin||undefined);
    }
    const ref=randomBytes(16).toString('hex');
    await SepayAttempt.create([{ref,orderId,userId,merchantId:config.merchantId,amount:payment.amount,returnOrigin}],{session});
    payment.activeSepayRef=ref;await payment.save({session});
    return sepayForm(config,ref,payment.amount,returnOrigin);
  });}finally{await session.endSession();}
}

async function markPaid(orderData:Data,transactionData:Data){
  const config=requiredConfig();
  const ref=identifier(orderData.order_invoice_number),gatewayOrderId=identifier(orderData.order_id);
  const transactionId=identifier(transactionData.id);
  if(orderData.order_status!=='CAPTURED'||transactionData.transaction_status!=='APPROVED'||transactionData.transaction_type!=='PAYMENT'||transactionData.payment_method!=='BANK_TRANSFER'||orderData.order_currency!=='VND'||transactionData.transaction_currency!=='VND')throw new PaymentError(409,'Kết quả chưa xác nhận thanh toán chuyển khoản thành công.');
  const amount=sepayAmount(orderData.order_amount);
  if(amount===null||amount<1||sepayAmount(transactionData.transaction_amount)!==amount)throw new PaymentError(400,'Số tiền SePay không khớp.');
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    const attempt=await SepayAttempt.findOne({ref,merchantId:config.merchantId}).session(session);
    if(!attempt)throw new PaymentError(404,'Không tìm thấy giao dịch SePay.');
    if(attempt.amount!==amount)throw new PaymentError(400,'Số tiền SePay không khớp đơn hàng.');
    if(attempt.status==='PAID'){
      if(attempt.gatewayTransactionId!==transactionId||attempt.gatewayOrderId!==gatewayOrderId)throw new PaymentError(409,'Giao dịch trùng có dữ liệu khác, cần đối soát.');
      return;
    }
    if(attempt.status!=='PENDING')throw new PaymentError(409,'Tiền đến sau khi hủy, cần đối soát với cửa hàng.');
    const payment=await Payment.findOne({orderId:attempt.orderId,userId:attempt.userId,activeSepayRef:ref,method:PaymentMethod.SEPAY,status:PaymentStatus.PENDING,amount}).session(session);
    const order=await Order.findOne({_id:attempt.orderId,userId:attempt.userId,paymentMethod:PaymentMethod.SEPAY,status:OrderStatus.PENDING,totalAmount:amount}).session(session);
    if(!payment||!order)throw new PaymentError(409,'Đơn hàng cần đối soát.');
    attempt.status='PAID';attempt.gatewayOrderId=gatewayOrderId;attempt.gatewayTransactionId=transactionId;await attempt.save({session});
    payment.status=PaymentStatus.PAID;payment.paidAt=new Date();payment.activeSepayRef=null;payment.gatewayTransactionNo=transactionId;await payment.save({session});
    await Notification.create([{userId:order.userId,title:'Thanh toán SePay thành công',message:'Đã xác nhận thanh toán cho đơn hàng.',href:`/orders/${order.id}`,dedupeKey:`payment:${payment.id}:PAID`}],{session});
  });}finally{await session.endSession();}
}

export async function receiveSepayIpn(body:unknown){
  const data=object(body);
  if(!Number.isSafeInteger(data.timestamp)||Number(data.timestamp)<=0)throw new PaymentError(400,'Timestamp IPN không hợp lệ.');
  // A void is a separate refund/reversal workflow; never silently unpay an order.
  if(data.notification_type!=='ORDER_PAID')throw new PaymentError(409,'Loại IPN cần xử lý đối soát riêng.');
  await markPaid(object(data.order),object(data.transaction));
}

async function gatewayRequest(path:string,method='GET',body?:Data):Promise<Data>{
  const config=requiredConfig();
  try{
    const response=await fetch((config.environment==='production'?'https://pgapi.sepay.vn/v1':sepayApiUrl)+path,{method,redirect:'error',headers:{Authorization:'Basic '+Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64'),'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error();
    return object(await response.json());
  }catch{throw new PaymentError(502,'Chưa truy vấn được SePay. Giữ nguyên trạng thái và thử lại sau.');}
}

async function activeAttempt(userId:string,orderId:string){
  const config=requiredConfig();
  const payment=await Payment.findOne({orderId,userId,method:PaymentMethod.SEPAY}).lean();
  if(!payment)throw new PaymentError(404,'Không tìm thấy thanh toán.');
  if(!payment.activeSepayRef)return null;
  const attempt=await SepayAttempt.findOne({ref:payment.activeSepayRef,userId,orderId,merchantId:config.merchantId,status:'PENDING'}).lean();
  if(!attempt)throw new PaymentError(409,'Giao dịch cần đối soát với cửa hàng.');
  return attempt;
}

async function reconcileAttempt(attempt:NonNullable<Awaited<ReturnType<typeof activeAttempt>>>){
  const response=await gatewayRequest('/order/detail/'+encodeURIComponent(attempt.ref));
  const order=object(response.data);
  if(order.order_invoice_number!==attempt.ref||sepayAmount(order.order_amount)!==attempt.amount||order.order_currency!=='VND')throw new PaymentError(502,'Phản hồi đối soát không khớp đơn hàng.');
  if(order.order_status==='CAPTURED'){
    const transactions=Array.isArray(order.transactions)?order.transactions.map(object):[];
    const approved=transactions.filter(t=>t.transaction_type==='PAYMENT'&&t.transaction_status==='APPROVED'&&t.payment_method==='BANK_TRANSFER'&&t.transaction_currency==='VND'&&sepayAmount(t.transaction_amount)===attempt.amount);
    if(approved.length!==1)throw new PaymentError(409,'Cần đối soát giao dịch thanh toán với cửa hàng.');
    await markPaid(order,approved[0]);
    return {message:'Đã xác nhận thanh toán SePay.'};
  }
  if(order.order_status==='CANCELLED'){
    if(Array.isArray(order.transactions)&&order.transactions.some(t=>object(t).transaction_status==='APPROVED'))throw new PaymentError(409,'Đơn có giao dịch được duyệt, cần đối soát trước khi hủy.');
    // Only the authenticated gateway API can release an unpaid attempt, never the browser return.
    const session=await mongoose.startSession();
    try{await session.withTransaction(async()=>{
      const payment=await Payment.findOne({orderId:attempt.orderId,userId:attempt.userId,activeSepayRef:attempt.ref,status:PaymentStatus.PENDING,method:PaymentMethod.SEPAY}).session(session);
      const current=await SepayAttempt.findOne({ref:attempt.ref,status:'PENDING'}).session(session);
      if(!payment||!current)throw new PaymentError(409,'Trạng thái đã thay đổi; vui lòng kiểm tra lại.');
      current.status='CANCELLED';current.gatewayOrderId=identifier(order.order_id);await current.save({session});
      payment.activeSepayRef=null;await payment.save({session});
    });}finally{await session.endSession();}
    return {message:'SePay đã xác nhận hủy thanh toán. Bạn có thể thử lại hoặc hủy đơn hàng.'};
  }
  return {message:'SePay chưa xác nhận thanh toán cuối cùng. Vui lòng chờ hoặc liên hệ cửa hàng.'};
}
export async function reconcileSepay(userId:string,orderId:string){
  const attempt=await activeAttempt(userId,orderId);
  return attempt?reconcileAttempt(attempt):{message:'Không còn giao dịch đang chờ. Hãy kiểm tra trạng thái đơn hàng.'};
}
export async function cancelSepayPayment(userId:string,orderId:string){
  const attempt=await activeAttempt(userId,orderId);
  if(!attempt)return {message:'Không có giao dịch đang chờ hủy.'};
  // Cancellation is authoritative only after a follow-up read, including when a payment won the race.
  try{await gatewayRequest('/order/cancel','POST',{order_invoice_number:attempt.ref});}catch{/* Re-read the authoritative result; never unlock on a network error. */}
  return reconcileAttempt(attempt);
}
