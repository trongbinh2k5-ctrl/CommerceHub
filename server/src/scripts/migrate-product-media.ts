import 'dotenv/config';
import mongoose from 'mongoose';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {localMediaDirectory,mediaFilename,productMediaBucket} from '../modules/products/media-storage';

async function main(){
  if(!process.env.MONGODB_URI)throw new Error('Thiếu cấu hình database.');
  const apply=process.argv.includes('--apply');
  let files:string[];
  try{files=(await readdir(localMediaDirectory())).filter(name=>mediaFilename.test(name));}
  catch(error:any){if(error.code==='ENOENT'){console.log('Không có thư mục ảnh local để chuyển.');return;}throw error;}
  await mongoose.connect(process.env.MONGODB_URI);
  try{
    const bucket=productMediaBucket();let copied=0,existing=0;
    for(const filename of files){
      const body=await readFile(path.join(localMediaDirectory(),filename));
      const saved=await bucket.find({filename}).limit(1).next();
      if(saved){if(saved.length!==body.length)throw new Error('Tên ảnh đã tồn tại với kích thước khác; cần kiểm tra trước khi chuyển.');existing++;continue;}
      if(apply)await new Promise<void>((resolve,reject)=>{const stream=bucket.openUploadStream(filename);stream.once('error',reject);stream.once('finish',resolve);stream.end(body);});
      copied++;
    }
    console.log(JSON.stringify({mode:apply?'copied':'dry-run',files:files.length,alreadyStored:existing,[apply?'copied':'wouldCopy']:copied,originalFilesPreserved:true}));
  }finally{await mongoose.disconnect();}
}
main().catch(()=>{console.error('Chuyển ảnh thất bại. Kiểm tra kết nối/quyền database và chạy lại; file gốc vẫn được giữ.');process.exitCode=1;});
