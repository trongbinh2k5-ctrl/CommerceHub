import { Router,type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { ShippingError } from './shipping.service';
import { ghnConfig } from './ghn.config';
import { GhnBooking } from './ghn.model';
import { cancelGhn,createGhn,previewGhn,syncGhn } from './ghn.service';
export const ghnRouter=Router();
ghnRouter.use(authenticate,authorize('STAFF','ADMIN'));
const run=(action:RequestHandler):RequestHandler=>async(req,res,next)=>{try{await action(req,res,next);}catch(error){if(error instanceof ShippingError){res.status(error.statusCode).json({success:false,message:error.message});return;}next(error);}};
ghnRouter.get('/options',(_req,res)=>{res.json({success:true,data:{enabled:!!ghnConfig(),environment:'staging'}});});
ghnRouter.get('/orders/:orderId',run(async(req,res)=>{
  const orderId=req.params.orderId;if(typeof orderId!=='string'||!/^[a-f\d]{24}$/i.test(orderId))throw new ShippingError('Mã đơn không hợp lệ.',400);
  const booking=await GhnBooking.findOne({orderId}).select('state trackingCode +payload').lean();
  res.json({success:true,data:booking?{state:booking.state,trackingCode:booking.trackingCode,parcel:Object.fromEntries(['weight','length','width','height'].map(k=>[k,booking.payload[k]]))}:null});
}));
for(const operation of ['preview','create','sync','cancel'] as const){
  const limit=rateLimit({windowMs:60000,limit:20,keyGenerator:req=>req.user!.userId,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Thao tác GHN quá nhanh. Vui lòng thử lại sau một phút.'}});
  ghnRouter.post('/orders/:orderId/'+operation,limit,run(async(req,res)=>{
    const orderId=req.params.orderId;if(typeof orderId!=='string')throw new ShippingError('Mã đơn không hợp lệ.',400);
    const result=operation==='preview'?await previewGhn(orderId,req.body):operation==='create'?await createGhn(orderId,req.body,req.user!.userId):operation==='cancel'?await cancelGhn(orderId,req.user!.userId):await syncGhn(orderId,req.user!.userId);
    res.json({success:true,data:result});
  }));
}
