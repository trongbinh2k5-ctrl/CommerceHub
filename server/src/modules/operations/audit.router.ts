import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { AuditEvent, auditActions } from './audit.service';
export const auditRouter = Router();
auditRouter.use(authenticate, authorize('ADMIN'));
auditRouter.get('/', async (req,res) => {
  const q=req.query, bad=()=>{res.status(400).json({success:false,message:'Bộ lọc nhật ký không hợp lệ.'});};
  if (['page','action','actorId','from','to','targetId'].some(k=>q[k]!==undefined&&typeof q[k]!=='string')) {bad();return;}
  const page=Number(q.page??1);
  if (!Number.isSafeInteger(page)||page<1||page>1000000||(q.action&&!auditActions.includes(q.action as any))||(q.actorId&&!isValidObjectId(q.actorId))||(q.targetId&&String(q.targetId).length>80)) {bad();return;}
  const filter:any={};
  if(q.action)filter.action=q.action;if(q.actorId)filter.actorId=q.actorId;if(q.targetId)filter.targetId=q.targetId;
  const dates:Record<string,Date>={};
  for(const key of ['from','to'])if(q[key]){
    const value=String(q[key]), date=new Date(value+'T00:00:00.000Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value){bad();return;}dates[key]=date;
  }
  if(dates.from&&dates.to&&dates.from>dates.to){bad();return;}
  if(dates.from||dates.to)filter.createdAt={...(dates.from?{$gte:dates.from}:{}),...(dates.to?{$lt:new Date(dates.to.getTime()+86400000)}:{})};
  const [data,total]=await Promise.all([AuditEvent.find(filter).populate('actorId','fullName email role').sort({createdAt:-1,_id:-1}).skip((page-1)*30).limit(30).lean(),AuditEvent.countDocuments(filter)]);
  res.json({success:true,data,pagination:{page,total,totalPages:Math.ceil(total/30)}});
});
