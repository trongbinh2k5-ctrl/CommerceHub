import 'dotenv/config';
import mongoose from 'mongoose';
import { Order } from '../modules/orders/order.model';
import { Payment } from '../modules/payments/payment.model';
import { SepayAttempt } from '../modules/payments/sepay.model';
import { sepayConfig } from '../modules/payments/sepay.config';
import { reconcileSepay } from '../modules/payments/sepay.service';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const config = sepayConfig();
  const orders = await Order.collection.find({ paymentMethod: 'SEPAY' }).sort({createdAt:-1}).limit(5).toArray();
  for (const o of orders) {
    const p = await Payment.findOne({orderId:o._id}).lean();
    const a = await SepayAttempt.findOne({orderId:o._id}).sort({createdAt:-1}).lean();
    const result: Record<string,unknown> = {order:String(o._id).slice(-8),amount:o.totalAmount,orderStatus:o.status,paymentStatus:p?.status,attemptStatus:a?.status,currentMerchant:a?.merchantId===config?.merchantId};
    if(a && config && a.merchantId===config.merchantId) {
      const response = await fetch(`https://${config.environment==='production'?'pgapi':'pgapi-sandbox'}.sepay.vn/v1/order/detail/${encodeURIComponent(a.ref)}`,{headers:{Authorization:'Basic '+Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64')},signal:AbortSignal.timeout(15000)});
      result.gatewayHttp=response.status;
      if(response.ok){const json=await response.json() as any;const d=json.data;result.gatewayStatus=d?.order_status;result.gatewayAmount=d?.order_amount;result.transactions=d?.transactions?.map((t:any)=>({status:t.transaction_status,type:t.transaction_type,amount:t.transaction_amount}));
        if(process.argv.includes('--reconcile') && d?.order_status==='CAPTURED' && p?.status==='PENDING') result.reconciliation=await reconcileSepay(String(o.userId),String(o._id));
      }
    }
    console.log(JSON.stringify(result));
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Inspection failed');process.exitCode=1;}).finally(()=>mongoose.disconnect());
