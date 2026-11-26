import { Schema, model } from 'mongoose';
const schema = new Schema({
  ref: {type:String,required:true,unique:true},
  orderId: {type:Schema.Types.ObjectId,required:true,index:true},
  userId: {type:Schema.Types.ObjectId,required:true},
  amount: {type:Number,required:true},
  status: {type:String,enum:['PENDING','PAID','FAILED'],default:'PENDING'},
  expiresAt: {type:Date,required:true},
  url: {type:String,required:true,select:false},
  responseCode: String,
  transactionNo: String,
}, {timestamps:true});
export const VnpayAttempt = model('VnpayAttempt',schema);
