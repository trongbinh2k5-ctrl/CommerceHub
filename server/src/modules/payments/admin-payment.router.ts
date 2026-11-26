import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";

import { authorize } from "../../middlewares/authorize.middleware";
import { Order } from '../orders/order.model';
import { reconcileSepay } from './sepay.service';
import { isValidOrderId } from '../orders/order.service';
import rateLimit from 'express-rate-limit';
import {confirmManualRefund} from './refund.service';
import {listRefundQueue,startManualRefund} from './refund-workflow.service';

import {
  getAdminPayments,
  getAdminPaymentDetail,
  confirmAdminCodPayment,
} from "./payment.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));

router.get("/", getAdminPayments);
router.get('/refunds',authorize('ADMIN'),async(req,res)=>{res.json({success:true,...await listRefundQueue(req.query)});});
router.post('/orders/:orderId/refund-start',authorize('ADMIN'),async(req,res)=>{res.json({success:true,data:await startManualRefund(String(req.params.orderId),req.user!.userId)});});

router.get("/orders/:orderId", getAdminPaymentDetail);
router.post('/orders/:orderId/reconcile', rateLimit({windowMs:60000,limit:10,keyGenerator:req=>req.user!.userId,standardHeaders:true,legacyHeaders:false}), async (req, res, next) => {
  try {
    if (!isValidOrderId(req.params.orderId)) { res.status(400).json({message:'Mã đơn không hợp lệ.'}); return; }
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) { res.status(404).json({message:'Không tìm thấy đơn hàng.'}); return; }
    res.json({success:true,data:await reconcileSepay(String(order.userId),String(order._id))});
  } catch (e) { next(e); }
});

router.patch("/orders/:orderId/confirm", confirmAdminCodPayment);
router.post('/orders/:orderId/refund-complete',authorize('ADMIN'),async(req,res)=>{res.json({success:true,data:await confirmManualRefund(String(req.params.orderId),req.user!.userId,req.body)});});

export default router;
