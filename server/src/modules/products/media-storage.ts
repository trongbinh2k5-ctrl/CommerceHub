import mongoose from 'mongoose';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {RequestHandler} from 'express';

export const mediaFilename=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(png|jpg|webp)$/i;
export const localMediaDirectory=()=>path.resolve(process.env.UPLOAD_DIRECTORY||path.join(process.cwd(),'var','uploads'));
export function productMediaBucket(){
  if(!mongoose.connection.db)throw Object.assign(new Error('Kho ảnh chưa sẵn sàng.'),{statusCode:503});
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'productMedia'});
}
export async function storeProductMedia(filename:string,body:Buffer){
  if(!mediaFilename.test(filename))throw new Error('Invalid media filename');
  if(process.env.UPLOAD_STORAGE==='gridfs'){
    await new Promise<void>((resolve,reject)=>{
      const upload=productMediaBucket().openUploadStream(filename);
      upload.once('error',reject);upload.once('finish',resolve);upload.end(body);
    });
  }else{
    const directory=localMediaDirectory();await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,filename),body,{flag:'wx'});
  }
}
export const serveGridMedia:RequestHandler=async(req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method)||!mediaFilename.test(req.path.slice(1)))return next();
  try{
    const bucket=productMediaBucket();const file=await bucket.find({filename:req.path.slice(1)}).sort({uploadDate:-1}).limit(1).next();
    if(!file)return next();
    res.setHeader('Content-Type',file.filename.endsWith('.png')?'image/png':file.filename.endsWith('.webp')?'image/webp':'image/jpeg');
    res.setHeader('Content-Length',file.length);
    res.setHeader('Cache-Control','public, max-age=2592000, immutable');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'");
    if(req.method==='HEAD'){res.end();return;}
    const stream=bucket.openDownloadStream(file._id);
    stream.on('error',next);res.once('close',()=>stream.destroy());stream.pipe(res);
  }catch(error){next(error);}
};
