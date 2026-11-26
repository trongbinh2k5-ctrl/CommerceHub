import { Router, raw, static as serveStatic,type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {storeProductMedia,serveGridMedia} from './media-storage';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
const directory=path.resolve(process.env.UPLOAD_DIRECTORY||path.join(process.cwd(),'var','uploads'));
const localFiles=serveStatic(directory,{dotfiles:'deny',index:false,immutable:true,maxAge:'30d',setHeaders:res=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'");}});
export const mediaFiles:RequestHandler=(req,res,next)=>process.env.UPLOAD_STORAGE==='gridfs'?serveGridMedia(req,res,next):localFiles(req,res,next);
export const mediaRouter=Router();
mediaRouter.post('/',authenticate,authorize('STAFF','ADMIN'),raw({type:['image/png','image/jpeg','image/webp'],limit:'5mb'}),async(req,res)=>{
  const b=req.body;const type=req.headers['content-type']?.split(';')[0];let ext='';
  if(Buffer.isBuffer(b)&&b.length>12){
    if(type==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.length>=33&&b.toString('ascii',12,16)==='IHDR'&&b.readUInt32BE(16)>0&&b.readUInt32BE(20)>0&&b.readUInt32BE(16)<=12000&&b.readUInt32BE(20)<=12000)ext='png';
    if(type==='image/jpeg'&&b[0]===255&&b[1]===216&&b[b.length-2]===255&&b[b.length-1]===217)ext='jpg';
    if(type==='image/webp'&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')ext='webp';
  }
  if(!ext){res.status(400).json({success:false,message:'Chỉ nhận ảnh PNG, JPEG hoặc WebP hợp lệ, tối đa 5 MB.'});return;}
  const filename=randomUUID()+'.'+ext;await storeProductMedia(filename,b);res.status(201).json({success:true,data:{url:'/api/media/'+filename}});
});
