import 'dotenv/config';
import { ghnBaseUrl,ghnConfig } from '../modules/shipping/ghn.config';
import mongoose from 'mongoose';

async function main(){
  const config=ghnConfig();
  if(!config){console.log('GHN test chưa đủ cấu hình.');process.exitCode=1;return;}
  try{
    const response=await fetch(ghnBaseUrl+'/v2/shop/all?offset=0&limit=100',{headers:{Token:config.token},redirect:'error',signal:AbortSignal.timeout(15000)});
    const result=await response.json() as any;
    const shops=result.data?.shops;
    const shop=Array.isArray(shops)?shops.find((s:any)=>Number(s._id)===config.shopId):null;
    if(shop)console.log(JSON.stringify({shopAddressPresent:!!shop.address,shopAddressFields:Object.keys(shop).filter(k=>/ward|district|province|new.*address/.test(k)),newAddress:shop.is_new_address??null}));
    if(shop&&process.argv.includes('--preview')){
      const r=await fetch(ghnBaseUrl+'/master-data/ward?district_id='+encodeURIComponent(shop.district_id),{headers:{Token:config.token,ShopId:String(config.shopId)},signal:AbortSignal.timeout(15000)});
      const j=await r.json() as any;
      console.log(JSON.stringify({senderDistrictHasWards:Array.isArray(j.data)&&j.data.length>0,senderWardMatchesDistrict:Array.isArray(j.data)&&j.data.some((w:any)=>String(w.WardCode)===String(shop.ward_code))}));
    }
    console.log(JSON.stringify({environment:'staging',httpStatus:response.status,apiCode:typeof result.code==='number'?result.code:null,tokenAccepted:response.ok&&result.code===200,configuredShopInFirstPage:Array.isArray(shops)?shops.some((s:any)=>Number(s._id)===config.shopId):null,shopsInPage:Array.isArray(shops)?shops.length:null}));
    if(process.argv.includes('--inspect-cancellation')){
      await mongoose.connect(process.env.MONGODB_URI!);
      try{
        const orders=await mongoose.connection.collection('orders').find({status:'CONFIRMED'}).sort({createdAt:-1}).limit(10).toArray();
        const suffix=process.argv.find(arg=>arg.startsWith('--order-suffix='))?.split('=')[1];
        if(!suffix||!/^[a-f0-9]{8}$/i.test(suffix)){console.log('Cần --order-suffix=8_ky_tu_cuoi_id.');return;}
        const order=orders.find(o=>String(o._id).endsWith(suffix.toLowerCase()));
        if(!order){console.log('Không tìm thấy đơn cần kiểm tra.');return;}
        const booking=await mongoose.connection.collection('ghnbookings').findOne({orderId:order._id});
        console.log(JSON.stringify({bookingState:booking?.state,localShipment:!!await mongoose.connection.collection('shipments').findOne({orderId:order._id})}));
        if(booking){const r=await fetch(ghnBaseUrl+'/v2/shipping-order/detail-by-client-code?client_order_code='+encodeURIComponent(booking.clientCode),{headers:{Token:config.token,ShopId:String(config.shopId)},signal:AbortSignal.timeout(15000)});const j=await r.json() as any;const m=String(j.message||'').toLowerCase();console.log(JSON.stringify({lookupHttp:r.status,apiCode:j.code,codeMessage:/^[A-Z_]{1,80}$/.test(j.code_message)?j.code_message:null,notFound:/not found|không tồn tại|không tìm thấy/.test(m),remoteStatus:typeof j.data?.status==='string'?j.data.status:null}));}
      }finally{await mongoose.disconnect();}
    }
    if(process.argv.includes('--preview')&&response.ok&&result.code===200){
      await mongoose.connect(process.env.MONGODB_URI!);
      try{
        const order=await mongoose.connection.collection('orders').findOne({status:'CONFIRMED'},{sort:{createdAt:-1}});
        if(!order){console.log('Không có đơn đã xác nhận để xem trước.');return;}
        const a=order.shippingAddress;
        const body={weight:2000,length:40,width:30,height:15,client_order_code:'BC-'+order._id,payment_type_id:1,required_note:'CHOXEMHANGKHONGTHU',service_type_id:2,to_name:a.fullName,to_phone:a.phone,to_address:a.detail,to_ward_name:a.ward,to_province_name:a.province,is_new_to_address:true,cod_amount:order.paymentMethod==='COD'?order.totalAmount:0,insurance_value:0,items:order.items.map((i:any)=>({name:i.name,code:i.sku,quantity:i.quantity,price:i.price}))};
        const r=await fetch(ghnBaseUrl+'/v2/shipping-order/preview',{method:'POST',headers:{Token:config.token,ShopId:String(config.shopId),'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
        const j=await r.json() as any;
        const message=String(j.message||'').toLowerCase();
        console.log(JSON.stringify({errorMatchesRecipient:message.endsWith('ward not found: '+String(a.ward).toLowerCase()+' in province '+String(a.province).toLowerCase())}));
        console.log(JSON.stringify({senderWardError:/from ward code/.test(message),recipientWardError:/to ward code/.test(message),routeError:/route not found/.test(message)}));
        console.log(JSON.stringify({previewHttp:r.status,apiCode:j.code,codeMessage:/^[A-Z_0-9]{1,80}$/.test(j.code_message)?j.code_message:null,fee:j.data?.total_fee,fields:['to_district_id','to_ward_code','to_province_name','to_ward_name','from_district_id','from_ward_code','service_type_id','insurance_value','weight','phone','address','client_order_code'].filter(k=>message.includes(k)),addressError:/địa chỉ|district|ward|province/.test(message),requiredError:/required|bắt buộc/.test(message)}));
      }finally{await mongoose.disconnect();}
    }
  }catch(error){console.log(JSON.stringify({connectionFailed:true,reason:error instanceof Error?error.name:'UnknownError'}));process.exitCode=1;}
}
void main();
