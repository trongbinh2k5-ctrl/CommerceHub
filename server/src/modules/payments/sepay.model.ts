import { Schema,model } from 'mongoose';
const schema=new Schema({
  ref:{type:String,required:true,unique:true},
  orderId:{type:Schema.Types.ObjectId,required:true,index:true},
  userId:{type:Schema.Types.ObjectId,required:true},
  merchantId:{type:String,required:true},
  amount:{type:Number,required:true,min:1,validate:Number.isSafeInteger},
  returnOrigin:{type:String,default:null},
  status:{type:String,enum:['PENDING','PAID','CANCELLED'],default:'PENDING'},
  gatewayOrderId:String,
  gatewayTransactionId:String,
},{timestamps:true});
schema.index({gatewayTransactionId:1},{unique:true,partialFilterExpression:{gatewayTransactionId:{$type:'string'}}});
export const SepayAttempt=model('SepayAttempt',schema);
