import { Router,type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { isValidOrderId } from '../orders/order.service';
import { PaymentError } from './payment.service';
import { authenticateSepayIpn,sepayConfig,sepayReturnIsPublic,sepayReturnOrigin } from './sepay.config';
import { SepayAttempt } from './sepay.model';
import { Payment } from './payment.model';
import { cancelSepayPayment,createSepayPayment,receiveSepayIpn,reconcileSepay } from './sepay.service';

export const sepayRouter=Router();
const run=(fn:RequestHandler):RequestHandler=>async(req,res,next)=>{
  try{await fn(req,res,next);}catch(error){if(error instanceof PaymentError){res.status(error.statusCode).json({success:false,message:error.message});return;}next(error);}
};
sepayRouter.get('/options',(_req,res)=>{const config=sepayConfig();res.json({success:true,data:{enabled:!!config,environment:config?.environment || 'sandbox',checkoutOrigin:config?.environment==='production'?new URL(config.returnUrl).origin:null,returnMode:config&&sepayReturnIsPublic(config.returnUrl)?'redirect':'manual'}});});
sepayRouter.post('/ipn',run(async(req,res)=>{
  const config=sepayConfig();
  if(!config)throw new PaymentError(503,'SePay chưa được cấu hình.');
  if(!authenticateSepayIpn(req.get('X-Secret-Key'),config.ipnSecret))throw new PaymentError(401,'IPN không được xác thực.');
  await receiveSepayIpn(req.body);res.json({success:true});
}));
// Public navigation bridge, not a payment confirmation endpoint. Destination is stored by an authenticated owner.
sepayRouter.get('/return',run(async(req,res)=>{
  if(typeof req.query.ref!=='string'||!/^[a-f0-9]{32}$/.test(req.query.ref))throw new PaymentError(400,'Mã giao dịch không hợp lệ.');
  const config=sepayConfig();if(!config)throw new PaymentError(503,'Chưa có cấu hình quay về.');
  const attempt=await SepayAttempt.findOne({ref:req.query.ref}).select('returnOrigin').lean();
  if(!attempt)throw new PaymentError(404,'Không tìm thấy giao dịch.');
  const origin=sepayReturnOrigin(attempt.returnOrigin,config)||new URL(config.returnUrl).origin;
  const target=new URL('/payments/sepay/return',origin);target.searchParams.set('ref',req.query.ref);
  if(typeof req.query.outcome==='string'&&['success','error','cancel'].includes(req.query.outcome))target.searchParams.set('outcome',req.query.outcome);
  res.setHeader('Referrer-Policy','no-referrer');res.redirect(303,target.href);
}));
sepayRouter.use(authenticate,authorize('CUSTOMER'));
sepayRouter.get('/result',run(async(req,res)=>{
  if(typeof req.query.ref!=='string'||!/^[a-f0-9]{32}$/.test(req.query.ref))throw new PaymentError(400,'Mã giao dịch không hợp lệ.');
  const attempt=await SepayAttempt.findOne({ref:req.query.ref,userId:req.user!.userId}).lean();
  if(!attempt)throw new PaymentError(404,'Không tìm thấy giao dịch.');
  const payment=await Payment.findOne({orderId:attempt.orderId,userId:req.user!.userId}).lean();
  res.json({success:true,data:{orderId:attempt.orderId,status:attempt.status,paymentStatus:payment?.status}});
}));
for(const [suffix,action] of [['',createSepayPayment],['/reconcile',reconcileSepay],['/cancel',cancelSepayPayment]] as const){
  const limit=rateLimit({windowMs:60000,limit:10,keyGenerator:req=>req.user!.userId,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau một phút.'}});
  sepayRouter.post('/orders/:orderId'+suffix,limit,run(async(req,res)=>{
    if(!isValidOrderId(req.params.orderId))throw new PaymentError(400,'Mã đơn không hợp lệ.');
    const data=suffix===''?await createSepayPayment(req.user!.userId,req.params.orderId,req.body?.returnOrigin):await action(req.user!.userId,req.params.orderId);
    res.json({success:true,data});
  }));
}
