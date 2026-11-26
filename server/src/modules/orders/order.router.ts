import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { quoteOrder } from './quote.service';
import {Order,OrderStatus} from './order.model';
import {Payment,PaymentStatus} from '../payments/payment.model';
import {browseCustomerOrders,reorder} from './customer-orders.service';

import {
  createMyOrder,
  getMyOrderList,
  getMyOrderDetail,
  cancelMyOrderController,
} from "./order.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.post("/", createMyOrder);
router.post('/quote', async (req, res) => { res.json({ success: true, data: await quoteOrder(req.user!.userId, req.body ?? {}) }); });
router.get('/',async(req,res,next)=>{if(req.query.view!==undefined){res.json({success:true,...await browseCustomerOrders(req.user!.userId,req.query)});return;}return getMyOrderList(req,res,next);});
router.get('/summary',async(req,res)=>{
 const orders=await Order.find({userId:req.user!.userId,status:OrderStatus.PENDING}).select('_id paymentMethod').lean();
 const paid=new Set((await Payment.find({orderId:{$in:orders.map(o=>o._id)},userId:req.user!.userId,status:PaymentStatus.PAID}).select('orderId').lean()).map(p=>String(p.orderId)));
 const awaitingApproval=orders.filter(o=>o.paymentMethod==='COD'||paid.has(String(o._id))).length;
 res.json({success:true,data:{awaitingApproval,awaitingPayment:orders.length-awaitingApproval}});
});
router.get("/:id", getMyOrderDetail);
router.patch("/:id/cancel", cancelMyOrderController);
router.post('/:id/reorder',async(req,res)=>{res.json({success:true,data:await reorder(req.user!.userId,String(req.params.id),req.get('Idempotency-Key'))});});

export default router;
