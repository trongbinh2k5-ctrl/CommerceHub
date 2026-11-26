import mongoose from 'mongoose';
import type { Request } from 'express';
export function parseListQuery(query:Request['query'],statuses:string[]) {
  for(const key of ['page','limit','search','status']) if(query[key]!==undefined&&typeof query[key]!=='string') throw Object.assign(new Error('Bộ lọc không hợp lệ.'),{statusCode:400});
  const page=Number(query.page??1),limit=Number(query.limit??30),search=String(query.search??'').trim(),status=query.status;
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger((page-1)*limit)||search.length>100||(status!==undefined&&!statuses.includes(String(status)))) throw Object.assign(new Error('Bộ lọc không hợp lệ.'),{statusCode:400});
  return {page,limit,search,status:status as string|undefined};
}
export async function listOrderRecords(model:any,query:Request['query'],statuses:string[],ownerId?:string,extraFilter?:Record<string,unknown>) {
  const {page,limit,search,status}=parseListQuery(query,statuses);
  const filter:any={...(ownerId?{userId:ownerId}:{}),...(status?{status}:{})};
  if(extraFilter)filter.$and=[extraFilter];
  if(search) {
    const text=new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    filter.$or=[{'shippingAddress.fullName':text},{'shippingAddress.phone':text},...(ownerId?[{'items.name':text},{'items.sku':text}]:[]),...(mongoose.isValidObjectId(search)?[{_id:search},{orderId:search}]:/^[a-f\d]{8}$/i.test(search)?[{$expr:{$regexMatch:{input:{$toString:'$_id'},regex:search+'$',options:'i'}}}]:[])];
  }
  const [data,total]=await Promise.all([model.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),model.countDocuments(filter)]);
  return {data,pagination:{page,total,totalPages:Math.ceil(total/limit)}};
}
