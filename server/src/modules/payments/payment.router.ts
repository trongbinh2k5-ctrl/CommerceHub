import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";

import { authorize } from "../../middlewares/authorize.middleware";

import { getMyPayment } from "./payment.controller";
import {getRefundRecipient,saveRefundRecipient} from './refund-workflow.service';

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.get("/orders/:orderId", getMyPayment);
router.get('/orders/:orderId/refund-details',async(req,res)=>{res.json({success:true,data:await getRefundRecipient(req.user!.userId,String(req.params.orderId))});});
router.patch('/orders/:orderId/refund-details',async(req,res)=>{res.json({success:true,data:await saveRefundRecipient(req.user!.userId,String(req.params.orderId),req.body)});});

export default router;
