import { Schema,model } from 'mongoose';
const schema=new Schema({
  orderId:{type:Schema.Types.ObjectId,required:true,unique:true},
  actorId:{type:Schema.Types.ObjectId,required:true},
  shopId:{type:Number,required:true},
  clientCode:{type:String,required:true,unique:true},
  state:{type:String,enum:['PENDING','UNCERTAIN','CREATED','CANCEL_CHECK','CANCELLED'],default:'PENDING'},
  createLeaseUntil:Date,
  lastCreateStartedAt:Date,
  payload:{type:Schema.Types.Mixed,required:true,select:false},
  trackingCode:String,
},{timestamps:true});
export const GhnBooking=model('GhnBooking',schema);
