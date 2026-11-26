import mongoose from 'mongoose';
import { Order,OrderStatus } from '../orders/order.model';
import { Payment,PaymentStatus } from '../payments/payment.model';
import { Notification } from '../operations/operations.models';
import { recordAudit } from '../operations/audit.service';
import { Shipment } from './shipping.model';
import { createShipment,ShippingError } from './shipping.service';
import { GhnBooking } from './ghn.model';
import { ghnBaseUrl,ghnConfig } from './ghn.config';
import type { ShippingStatus } from './shipping.types';
import {validateDeliveryAddress} from '../addresses/address-catalog';

type Data=Record<string,any>;
function config(){const value=ghnConfig();if(!value)throw new ShippingError('GHN test chưa được cấu hình.',503);return value;}
function object(value:unknown):Data{if(!value||typeof value!=='object'||Array.isArray(value))throw new ShippingError('Phản hồi GHN không hợp lệ.',502);return value as Data;}
function id(value:string){if(!/^[a-f\d]{24}$/i.test(value))throw new ShippingError('Mã đơn hàng không hợp lệ.',400);return value;}
function parcel(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ShippingError('Cần nhập thông số kiện hàng.',400);
  const body=object(input),result:Record<string,number>={};
  for(const key of ['weight','length','width','height']){
    const value=body[key],max=key==='weight'?19999:200;
    if(!Number.isSafeInteger(value)||value<1||value>max)throw new ShippingError(key==='weight'?'Khối lượng kiện cần từ 1 đến 19.999 gram.':'Kích thước kiện cần là số nguyên từ 1 đến 200 cm.',400);
    result[key]=value;
  }
  return result;
}
async function request(path:string,body:Data,method='POST',allowArray=false,allowMissing=false){
  const settings=config();
  try{
    const url=ghnBaseUrl+path+(method==='GET'?'?'+new URLSearchParams(Object.entries(body).map(([k,v])=>[k,String(v)])):'');
    const response=await fetch(url,{method,redirect:'error',headers:{'Content-Type':'application/json',Token:settings.token,ShopId:String(settings.shopId)},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
    const result=object(await response.json());
    if(!response.ok||result.code!==200){
      const message=String(result.message||'').toLowerCase();
      if(allowMissing&&method==='GET'&&path==='/v2/shipping-order/detail-by-client-code'&&response.status===400&&result.code===400&&message.endsWith('đơn hàng không tồn tại'))return {missing:true};
      // GHN staging can label a recipient lookup failure as "from ward code".
      // Match the submitted recipient values before interpreting that label.
      const recipientSuffix='ward not found: '+String(body.to_ward_name||'').toLowerCase()+' in province '+String(body.to_province_name||'').toLowerCase();
      if(body.to_ward_name&&body.to_province_name&&message.endsWith(recipientSuffix))throw new ShippingError('GHN không nhận diện được tỉnh/thành hoặc phường/xã của người nhận trong đơn hàng. Không dùng tên viết tắt như hn, kq; cần tên đầy đủ theo danh mục GHN. Sửa sổ địa chỉ không thay đổi địa chỉ đã lưu trong đơn cũ. Yêu cầu đã gửi vẫn được giữ để đối soát, không tự tạo vận đơn khác.',502);
      if(/from ward code|from district|from province/.test(message))throw new ShippingError('GHN không nhận diện được địa chỉ lấy hàng của shop. Hãy cập nhật tỉnh/thành và phường/xã của địa chỉ lấy hàng trên tài khoản GHN test, rồi thử lại. Nếu đã bấm tạo vận đơn, giữ nguyên thông số khi thử lại.',502);
      if(response.status===401||response.status===403)throw new ShippingError('GHN từ chối quyền truy cập. Kiểm tra Token test, Shop ID và giới hạn IP trên tài khoản GHN.',502);
      throw new Error();
    }
    return allowArray&&Array.isArray(result.data)?{items:result.data}:object(result.data);
  }catch(error){if(error instanceof ShippingError)throw error;throw new ShippingError('Chưa nhận được xác nhận hợp lệ từ GHN. Kiểm tra cấu hình/địa chỉ và đồng bộ lại; không tạo vận đơn khác khi kết quả chưa rõ.',502);}
}
async function eligible(orderId:string,session?:mongoose.ClientSession){
  const query=Order.findById(id(orderId));if(session)query.session(session);const order=await query;
  if(!order)throw new ShippingError('Không tìm thấy đơn hàng.',404);
  if(order.status!=='CONFIRMED')throw new ShippingError('Chỉ tạo GHN cho đơn đã xác nhận.',409);
  const p=Payment.findOne({orderId:order._id});if(session)p.session(session);const payment=await p;
  if(!payment||String(payment.userId)!==String(order.userId)||payment.method!==order.paymentMethod||payment.amount!==order.totalAmount||payment.status!==(order.paymentMethod==='COD'?'PENDING':'PAID'))throw new ShippingError('Thanh toán không phù hợp để giao hàng.',409);
  const exists=Shipment.exists({orderId:order._id});if(session)exists.session(session);
  if(await exists)throw new ShippingError('Đơn hàng đã có vận đơn.',409);
  return order;
}
function payload(order:any,input:unknown){
  const dimensions=parcel(input),a=order.shippingAddress;
  try{Object.assign(a,validateDeliveryAddress(a));}catch{throw new ShippingError('Địa chỉ người nhận trong đơn chưa hợp lệ. Cần tỉnh/thành, phường/xã đúng danh mục và địa chỉ chi tiết đầy đủ.',400);}
  if(!a?.fullName||!a.phone||!a.province||!a.ward||!a.detail)throw new ShippingError('Địa chỉ giao hàng chưa đủ thông tin.',400);
  const cod=order.paymentMethod==='COD'?order.totalAmount:0;
  if(!Number.isSafeInteger(cod)||cod>50000000)throw new ShippingError('COD GHN hỗ trợ tối đa 50 triệu đồng.',400);
  return {...dimensions,client_order_code:'BC-'+order.id,payment_type_id:1,required_note:'CHOXEMHANGKHONGTHU',service_type_id:2,
    to_name:a.fullName,to_phone:a.phone,to_address:a.detail,to_ward_name:a.ward,to_province_name:a.province,is_new_to_address:true,
    cod_amount:cod,insurance_value:0,content:order.items.map((i:any)=>`${i.name} x${i.quantity}`).join('; ').slice(0,2000),
    items:order.items.map((i:any)=>({name:i.name.slice(0,512),code:i.sku,quantity:i.quantity,price:i.price}))};
}
export async function previewGhn(orderId:string,input:unknown){
  config();const order=await eligible(orderId);const body=payload(order,input);
  const data=await request('/v2/shipping-order/preview',body);
  if(!Number.isSafeInteger(data.total_fee)||data.total_fee<0)throw new ShippingError('GHN chưa trả phí hợp lệ.',502);
  return {fee:data.total_fee,codAmount:body.cod_amount,environment:'staging',note:'Chi phí GHN nội bộ; không thay đổi phí khách đã thanh toán.'};
}
export async function createGhn(orderId:string,input:unknown,actorId:string){
  const settings=config();id(orderId);
  // Validate parcel before making any reservation or external request.
  const dimensions=parcel(input);
  const session=await mongoose.startSession();let booking;
  try{booking=await session.withTransaction(async()=>{
    const previous=await GhnBooking.findOne({orderId}).select('+payload').session(session);
    if(previous){
      if(previous.shopId!==settings.shopId)throw new ShippingError('Shop GHN đã thay đổi; cần đối soát vận đơn cũ.',409);
      if(Object.keys(dimensions).some(k=>previous.payload[k]!==dimensions[k]))throw new ShippingError('Kiện hàng đã được gửi GHN. Giữ thông số cũ khi thử lại để tránh đơn trùng.',409);
      return previous;
    }
    const order=await eligible(orderId,session),body=payload(order,dimensions);
    await Order.updateOne({_id:order._id,status:OrderStatus.CONFIRMED},{$inc:{__v:1}},{session});
    const [created]=await GhnBooking.create([{orderId:order._id,actorId,shopId:settings.shopId,clientCode:body.client_order_code,state:'PENDING',payload:body}],{session});
    return created!;
  });}finally{await session.endSession();}
  if(!booking)throw new ShippingError('Chưa tạo được yêu cầu GHN.',500);
  if(['CANCELLED','CANCEL_CHECK'].includes(booking.state))throw new ShippingError('Yêu cầu đang được hủy hoặc đã hủy. Không tạo lại vận đơn trên cùng đơn hàng.',409);
  const existing=await Shipment.findOne({orderId});if(existing)return existing;
  const now=new Date();
  const claimed=await GhnBooking.findOneAndUpdate({_id:booking._id,state:{$in:['PENDING','UNCERTAIN']},$or:[{createLeaseUntil:{$exists:false}},{createLeaseUntil:{$lte:now}}]},{$set:{createLeaseUntil:new Date(now.getTime()+60000),lastCreateStartedAt:now}},{returnDocument:'after'});
  if(!claimed)throw new ShippingError('Yêu cầu GHN đang được xử lý hoặc hủy. Vui lòng kiểm tra lại sau.',409);
  try{
    // GHN guarantees the same client_order_code returns its existing order_code on retry.
    const created=await request('/v2/shipping-order/create',booking.payload);
    if(typeof created.order_code!=='string'||! /^[A-Z0-9][A-Z0-9_-]{5,39}$/.test(created.order_code)||!Number.isSafeInteger(created.total_fee)||created.total_fee<0)throw new ShippingError('GHN trả mã hoặc phí không hợp lệ; cần đồng bộ lại.',502);
    let shipment=await Shipment.findOne({orderId});
    if(!shipment){try{shipment=await createShipment({orderId,carrier:'GHN (test)',trackingCode:created.order_code,carrierFee:created.total_fee},actorId,{bookingId:booking.id});}catch(error){shipment=await Shipment.findOne({orderId});if(!shipment)throw error;}}
    if(shipment!.trackingCode!==created.order_code)throw new ShippingError('Mã GHN thay đổi ngoài dự kiến; cần đối soát.',409);
    const saved=await GhnBooking.updateOne({_id:booking._id,state:{$in:['PENDING','UNCERTAIN','CREATED']}},{$set:{state:'CREATED',trackingCode:shipment!.trackingCode}});
    if(!saved.matchedCount)throw new ShippingError('Yêu cầu đang đối soát hủy. Hãy tải lại trạng thái đơn hàng.',409);
    return shipment;
  }catch(error){await GhnBooking.updateOne({_id:booking._id,state:{$in:['PENDING','UNCERTAIN']}},{$set:{state:'UNCERTAIN'}});throw error;}
  finally{await GhnBooking.updateOne({_id:booking._id,createLeaseUntil:new Date(now.getTime()+60000)},{$unset:{createLeaseUntil:1}});}
}

// Freeze retries before checking a missing local shipment. A short grace period
// lets a previously timed-out create finish at GHN before absence is accepted.
export async function cancelUncertainGhn(orderId:string,actorId:string){
  const settings=config();id(orderId);
  const booking=await GhnBooking.findOne({orderId});
  if(!booking||booking.shopId!==settings.shopId)throw new ShippingError('Không tìm thấy yêu cầu GHN thuộc shop hiện tại.',409);
  if(booking.state==='CANCELLED')return;
  const cutoff=new Date(Date.now()-60000);
  const frozen=await GhnBooking.findOneAndUpdate({_id:booking._id,state:{$in:['PENDING','UNCERTAIN','CANCEL_CHECK']},$and:[{$or:[{createLeaseUntil:{$exists:false}},{createLeaseUntil:{$lte:new Date()}}]},{$or:[{state:'CANCEL_CHECK'},{lastCreateStartedAt:{$lte:cutoff}},{lastCreateStartedAt:{$exists:false},updatedAt:{$lte:cutoff}}]}]},{$set:{state:'CANCEL_CHECK'}},{returnDocument:'after'});
  if(!frozen)throw new ShippingError('Yêu cầu tạo GHN vừa được gửi hoặc đang xử lý. Đợi ít nhất một phút rồi thử hủy lại.',409);
  const remote=await request('/v2/shipping-order/detail-by-client-code',{client_order_code:booking.clientCode},'GET',false,true);
  if(!remote.missing){
    if(remote.client_order_code!==booking.clientCode||remote.shop_id!==settings.shopId||typeof remote.order_code!=='string'||! /^[A-Z0-9][A-Z0-9_-]{5,39}$/.test(remote.order_code))throw new ShippingError('GHN trả dữ liệu không khớp; chưa thể hủy đơn.',502);
    if(!['cancel','ready_to_pick','picking','money_collect_picking'].includes(remote.status))throw new ShippingError('GHN đã tiếp nhận/bàn giao vận chuyển; cần cửa hàng xử lý trực tiếp.',409);
    if(remote.status!=='cancel'){
      await request('/v2/switch-status/cancel',{order_codes:[remote.order_code]},'POST',true);
      const verified=await request('/v2/shipping-order/detail-by-client-code',{client_order_code:booking.clientCode},'GET');
      if(verified.client_order_code!==booking.clientCode||verified.shop_id!==settings.shopId||verified.order_code!==remote.order_code||verified.status!=='cancel')throw new ShippingError('GHN chưa xác nhận hủy. Đơn hàng chưa được hủy; hãy thử lại sau.',409);
    }
  }
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    if(await Shipment.exists({orderId}).session(session))throw new ShippingError('Vận đơn vừa được cập nhật. Tải lại trang trước khi hủy.',409);
    const changed=await GhnBooking.updateOne({_id:booking._id,state:'CANCEL_CHECK'},{$set:{state:'CANCELLED'}},{session});
    if(changed.modifiedCount)await recordAudit(actorId,'SHIPMENT_UPDATED','ORDER',orderId,remote.missing?'GHN xác nhận không có vận đơn; đóng yêu cầu tạo cũ.':'GHN xác nhận hủy vận đơn chưa lưu trong website.',[],session);
  });}finally{await session.endSession();}
}
const mapped:Record<string,ShippingStatus>={ready_to_pick:'READY',picking:'READY',money_collect_picking:'READY',picked:'PICKED_UP',storing:'IN_TRANSIT',transporting:'IN_TRANSIT',sorting:'IN_TRANSIT',delivering:'OUT_FOR_DELIVERY',money_collect_delivering:'OUT_FOR_DELIVERY',delivery_fail:'DELIVERY_FAILED',waiting_to_return:'RETURNING',return:'RETURNING',return_transporting:'RETURNING',return_sorting:'RETURNING',returning:'RETURNING',return_fail:'RETURNING',returned:'RETURNED',delivered:'DELIVERED',cancel:'CANCELLED'};
export async function syncGhn(orderId:string,actorId:string){
  const settings=config();id(orderId);
  const booking=await GhnBooking.findOne({orderId});if(!booking||booking.shopId!==settings.shopId)throw new ShippingError('Không có yêu cầu GHN thuộc shop hiện tại.',404);
  const remote=await request('/v2/shipping-order/detail-by-client-code',{client_order_code:booking.clientCode},'GET');
  if(remote.client_order_code!==booking.clientCode||remote.shop_id!==settings.shopId||typeof remote.order_code!=='string')throw new ShippingError('Phản hồi GHN không khớp đơn/shop.',502);
  const shipment=await Shipment.findOne({orderId});
  if(!shipment)throw new ShippingError('GHN đã có đơn. Hãy bấm tạo lại với đúng thông số cũ để khôi phục vận đơn trong website.',409);
  if(remote.order_code!==shipment.trackingCode)throw new ShippingError('Mã GHN không khớp vận đơn.',409);
  const updatedAt=new Date(remote.updated_date);
  if(!Number.isFinite(updatedAt.getTime())||typeof remote.status!=='string'||remote.status.length>80)throw new ShippingError('GHN chưa trả thời gian/trạng thái hợp lệ.',502);
  const session=await mongoose.startSession();
  try{return await session.withTransaction(async()=>{
    const current=await Shipment.findById(shipment._id).session(session);if(!current)throw new ShippingError('Không tìm thấy vận đơn.',404);
    if(current.providerUpdatedAt&&current.providerUpdatedAt>=updatedAt)return current;
    const order=await Order.findById(orderId).session(session);if(!order)throw new ShippingError('Không tìm thấy đơn hàng.',404);
    if(remote.cod_amount!==(order.paymentMethod==='COD'?order.totalAmount:0))throw new ShippingError('COD tại GHN khác số tiền đơn hàng; cần đối soát.',409);
    const next=mapped[remote.status];
    if(['DELIVERED','RETURNED','CANCELLED'].includes(current.status)&&next&&next!==current.status)throw new ShippingError('GHN thay đổi trạng thái cuối; cần đối soát thủ công.',409);
    const before=current.status;current.providerStatus=remote.status;current.providerUpdatedAt=updatedAt;
    if(next){
      if(next==='CANCELLED'&&current.status!=='READY')throw new ShippingError('GHN hủy sau bàn giao; cần đối soát.',409);
      current.status=next;
      if(next==='OUT_FOR_DELIVERY'&&before!==next)current.deliveryAttempts+=1;
      if(['PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERY_FAILED','RETURNING'].includes(next)){order.status=OrderStatus.SHIPPING;if(!current.pickedUpAt)current.pickedUpAt=updatedAt;}
      if(next==='DELIVERED'){order.status=OrderStatus.DELIVERED;current.deliveredAt=updatedAt;}
      if(next==='RETURNED'){order.status=OrderStatus.RETURNED;current.returnedAt=updatedAt;if(order.paymentMethod==='COD')await Payment.updateOne({orderId,status:PaymentStatus.PENDING},{$set:{status:PaymentStatus.CANCELLED,cancelledAt:updatedAt}},{session});}
      if(next==='CANCELLED')await GhnBooking.updateOne({_id:booking._id},{$set:{state:'CANCELLED'}},{session});
      await order.save({session});
    }
    const labels:Partial<Record<ShippingStatus,string>>={READY:'Chờ lấy hàng',PICKED_UP:'Đã lấy hàng',IN_TRANSIT:'Đang trung chuyển',OUT_FOR_DELIVERY:'Đang giao hàng',DELIVERY_FAILED:'Giao hàng chưa thành công',RETURNING:'Đang hoàn hàng',RETURNED:'Hàng đã hoàn về',DELIVERED:'Đã giao hàng',CANCELLED:'Đã hủy vận đơn'};
    const note='GHN test: '+(next?labels[next]:'Có cập nhật cần cửa hàng kiểm tra')+'.';
    current.events.push({fromStatus:before,toStatus:current.status,note,actorId:new mongoose.Types.ObjectId(actorId),createdAt:updatedAt});
    await current.save({session});
    await Notification.create([{userId:order.userId,title:'Cập nhật vận chuyển GHN',message:note,href:`/orders/${orderId}`,dedupeKey:`ghn:${current.id}:${updatedAt.toISOString()}`}],{session});
    await recordAudit(actorId,'SHIPMENT_UPDATED','SHIPMENT',current._id,note,[{field:'status',before,after:current.status}],session);
    return current;
  });}finally{await session.endSession();}
}
export async function cancelGhn(orderId:string,actorId:string){
  config();const booking=await GhnBooking.findOne({orderId:id(orderId)});
  if(!booking?.trackingCode)throw new ShippingError('Chưa có mã GHN để yêu cầu hủy; cần đối soát kết quả tạo.',409);
  await request('/v2/switch-status/cancel',{order_codes:[booking.trackingCode]},'POST',true);
  return syncGhn(orderId,actorId);
}
