import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {createApp} from '../src/app';
import {User} from '../src/modules/auth/user.model';
import {generateAccessToken} from '../src/modules/auth/token.service';

test('GridFS uploads persist across application instances with the same protected upload and public image URL',async()=>{
  const before={UPLOAD_STORAGE:process.env.UPLOAD_STORAGE,JWT_ACCESS_SECRET:process.env.JWT_ACCESS_SECRET};
  process.env.UPLOAD_STORAGE='gridfs';process.env.JWT_ACCESS_SECRET='deployment-test-only-secret-at-least-32-bytes';
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri('deployment_media'));
  const admin=await User.create({fullName:'QA Admin',email:'deploy-admin@test.local',passwordHash:'test-only',role:'ADMIN',emailVerifiedAt:new Date()});
  const customer=await User.create({fullName:'QA Customer',email:'deploy-customer@test.local',passwordHash:'test-only',role:'CUSTOMER',emailVerifiedAt:new Date()});
  const token=(u:typeof admin)=>generateAccessToken({userId:u.id,role:u.role});
  const listen=async()=>{const server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));return {server,base:'http://127.0.0.1:'+(server.address() as {port:number}).port};};
  const first=await listen();let second:Awaited<ReturnType<typeof listen>>|undefined;
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aONsAAAAASUVORK5CYII=','base64');
  try{
    const upload=(auth?:string,body:Buffer=image)=>fetch(first.base+'/api/admin/media',{method:'POST',headers:{'Content-Type':'image/png',...(auth?{Authorization:'Bearer '+auth}:{})},body});
    assert.equal((await upload()).status,401);assert.equal((await upload(token(customer))).status,403);
    assert.equal((await upload(token(admin),Buffer.from('not an image'))).status,400);
    const response=await upload(token(admin));assert.equal(response.status,201);const saved=await response.json() as {data:{url:string}};
    assert.match(saved.data.url,/^\/api\/media\/[a-f\d-]{36}\.png$/);
    await new Promise<void>(resolve=>first.server.close(()=>resolve()));second=await listen();
    const photo=await fetch(second.base+saved.data.url);assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),image);assert.equal(photo.headers.get('x-content-type-options'),'nosniff');
    const head=await fetch(second.base+saved.data.url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(image.length));assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal((await fetch(second.base+'/api/media/00000000-0000-0000-0000-000000000000.png')).status,404);
    assert.equal((await fetch(second.base+'/api/media/.env')).status,404);
  }finally{
    if(first.server.listening)await new Promise<void>(resolve=>first.server.close(()=>resolve()));
    if(second?.server.listening)await new Promise<void>(resolve=>second!.server.close(()=>resolve()));
    await mongoose.disconnect();await mongo.stop();
    for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
