import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { isValidOrderId } from '../orders/order.service';
import { createVnpayPayment, receiveVnpayIpn, reconcileVnpay } from './vnpay.service';
import rateLimit from 'express-rate-limit';
import { PaymentError } from './payment.service';
import { vnpayConfig } from './vnpay.config';
import { VnpayAttempt } from './vnpay.model';
import { Payment } from './payment.model';
export const vnpayRouter = Router();
const queryLimit=rateLimit({windowMs:60000,limit:6,standardHeaders:true,legacyHeaders:false});
vnpayRouter.post('/orders/:orderId/reconcile',authenticate,authorize('CUSTOMER'),queryLimit,async(req,res,next)=>{
  try {
    if(!isValidOrderId(req.params.orderId)){res.status(400).json({success:false,message:'Mã đơn không hợp lệ.'});return;}
    res.json({success:true,data:await reconcileVnpay(req.user!.userId,req.params.orderId,req.ip||'')});
  }catch(error){if(error instanceof PaymentError){res.status(error.statusCode).json({success:false,message:error.message});return;}next(error);}
});
vnpayRouter.get('/options', (_req,res) => {res.json({success:true,data:{enabled:!!vnpayConfig(),environment:'sandbox'}});});
vnpayRouter.get('/result',authenticate,authorize('CUSTOMER'),async(req,res,next)=>{
  try {
    if(typeof req.query.ref !== 'string' || !/^[a-f0-9]{32}$/.test(req.query.ref)){res.status(400).json({success:false,message:'Mã giao dịch không hợp lệ.'});return;}
    const attempt=await VnpayAttempt.findOne({ref:req.query.ref,userId:req.user!.userId}).lean();
    if(!attempt){res.status(404).json({success:false,message:'Không tìm thấy giao dịch.'});return;}
    const payment=await Payment.findOne({orderId:attempt.orderId,userId:req.user!.userId}).lean();
    res.json({success:true,data:{orderId:attempt.orderId,status:attempt.status,paymentStatus:payment?.status}});
  }catch(error){next(error);}
});
// Public server-to-server endpoint. Its authentication is the verified HMAC, not a customer cookie.
vnpayRouter.get('/ipn', async (req,res) => {
  try {res.json(await receiveVnpayIpn(req.query));}
  catch {res.json({RspCode:'99',Message:'Please retry'});}
});
vnpayRouter.post('/orders/:orderId',authenticate,authorize('CUSTOMER'),async(req,res,next)=>{
  try {
    if (!isValidOrderId(req.params.orderId)) {res.status(400).json({success:false,message:'Mã đơn không hợp lệ.'});return;}
    res.json({success:true,data:await createVnpayPayment(req.user!.userId,req.params.orderId,req.ip || '')});
  } catch(error) {
    if(error instanceof PaymentError){res.status(error.statusCode).json({success:false,message:error.message});return;}
    next(error);
  }
});
