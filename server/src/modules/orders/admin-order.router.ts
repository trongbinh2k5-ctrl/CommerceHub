import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import { getAdminOrderList, changeOrderStatus } from "./order.controller";
import {Order,OrderStatus} from './order.model';

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));

router.get("/", getAdminOrderList);
router.get('/summary',async(_req,res)=>{
  const [summary]=await Order.aggregate([
    {$match:{status:OrderStatus.PENDING}},
    {$lookup:{from:'payments',localField:'_id',foreignField:'orderId',as:'payment'}},
    {$unwind:'$payment'},
    {$match:{$expr:{$and:[{$eq:['$userId','$payment.userId']},{$eq:['$totalAmount','$payment.amount']},{$eq:['$paymentMethod','$payment.method']}]}}},
    {$group:{_id:null,awaitingApproval:{$sum:{$cond:[{$or:[{$and:[{$eq:['$paymentMethod','COD']},{$eq:['$payment.status','PENDING']}]},{$and:[{$ne:['$paymentMethod','COD']},{$eq:['$payment.status','PAID']}]}]},1,0]}},awaitingPayment:{$sum:{$cond:[{$and:[{$ne:['$paymentMethod','COD']},{$eq:['$payment.status','PENDING']}]},1,0]}}}}
  ]);
  res.json({success:true,data:{awaitingApproval:summary?.awaitingApproval||0,awaitingPayment:summary?.awaitingPayment||0}});
});
router.patch("/:id/status", changeOrderStatus);

export default router;
