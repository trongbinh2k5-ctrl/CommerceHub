import express,{type Express} from 'express';
import helmet from 'helmet';
import path from 'node:path';
import {existsSync} from 'node:fs';

export const defaultFrontendDirectory=path.resolve(__dirname,'../../../client/dist');
export function installFrontend(app:Express,directory:string){
  const index=path.join(directory,'index.html');
  if(!existsSync(index))throw new Error('Frontend build missing. Run npm run build from the repository root.');
  const policy=helmet.contentSecurityPolicy({directives:{
    imgSrc:["'self'",'data:','https:'],
    formAction:["'self'",'https://pay.sepay.vn','https://pay-sandbox.sepay.vn','https://sandbox.vnpayment.vn'],
    connectSrc:["'self'"],
    fontSrc:["'self'"],
    frameAncestors:["'none'"],
    ...(process.env.NODE_ENV==='production'?{}:{upgradeInsecureRequests:null}),
  }});
  app.use((req,res,next)=>{
    if(/^\/(?:api|health)(?:\/|$)/.test(req.path))return next();
    policy(req,res,next);
  });
  const files=express.static(directory,{dotfiles:'deny',index:false,maxAge:'1h',setHeaders:(res,file)=>{
    if(path.relative(directory,file).split(path.sep)[0]==='assets')res.setHeader('Cache-Control','public, max-age=31536000, immutable');
  }});
  app.use((req,res,next)=>/^\/(?:api|health)(?:\/|$)/.test(req.path)?next():files(req,res,next));
  app.get(/.*/,(req,res,next)=>{
    if(/^\/(?:api|health)(?:\/|$)/.test(req.path)||req.path.split('/').some(part=>part.startsWith('.'))||path.extname(req.path)||!req.accepts('html'))return next();
    res.setHeader('Cache-Control','no-cache');
    res.sendFile(index);
  });
}
