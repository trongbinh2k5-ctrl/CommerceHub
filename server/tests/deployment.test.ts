import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app';
import {applyHostedDefaults} from '../src/config/hosted-environment';

test('hosted defaults use one HTTPS origin without overriding explicit settings',()=>{
  const env:NodeJS.ProcessEnv={SERVE_FRONTEND:'true',RENDER_EXTERNAL_URL:'https://berylcore-test.onrender.com',SEPAY_ENABLED:'true'};
  applyHostedDefaults(env);
  assert.equal(env.PUBLIC_APP_URL,'https://berylcore-test.onrender.com');
  assert.equal(env.CORS_ORIGINS,env.PUBLIC_APP_URL);
  assert.equal(env.SEPAY_RETURN_URL,'https://berylcore-test.onrender.com/payments/sepay/return');
  env.PUBLIC_APP_URL='https://shop.example.com';env.CORS_ORIGINS=env.PUBLIC_APP_URL;env.SEPAY_RETURN_URL='https://shop.example.com/return';
  applyHostedDefaults(env);assert.equal(env.PUBLIC_APP_URL,'https://shop.example.com');assert.equal(env.SEPAY_RETURN_URL,'https://shop.example.com/return');
  assert.throws(()=>applyHostedDefaults({SERVE_FRONTEND:'true',RENDER_EXTERNAL_URL:'http://invalid.example.com'}));
  const local:NodeJS.ProcessEnv={RENDER_EXTERNAL_URL:'https://ignored.example.com'};applyHostedDefaults(local);assert.equal(local.PUBLIC_APP_URL,undefined);
});

test('production frontend serves deep links and assets without swallowing API errors or secrets',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'berylcore-deploy-'));
  await mkdir(path.join(directory,'assets'));await mkdir(path.join(directory,'api'));
  await writeFile(path.join(directory,'index.html'),'<!doctype html><html><title>BerylCore test</title></html>');
  await writeFile(path.join(directory,'assets','app-hash.js'),'window.BERYLCORE=true');
  await writeFile(path.join(directory,'api','must-not-serve.txt'),'private fixture');
  await writeFile(path.join(directory,'.env'),'fake fixture secret');
  const app=createApp({frontendDirectory:directory});const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
  try{
    for(const route of ['/','/account','/orders/507f1f77bcf86cd799439011','/payments/sepay/return?ref=demo']){
      const response=await fetch(base+route,{headers:{Accept:'text/html'}});assert.equal(response.status,200);assert.match(await response.text(),/BerylCore test/);assert.equal(response.headers.get('cache-control'),'no-cache');
      const csp=response.headers.get('content-security-policy')||'';assert.match(csp,/img-src 'self' data: https:/);assert.match(csp,/form-action[^;]+https:\/\/pay\.sepay\.vn/);assert.match(csp,/frame-ancestors 'none'/);
    }
    const asset=await fetch(base+'/assets/app-hash.js');assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control')||'',/immutable/);assert.match(asset.headers.get('content-type')||'',/javascript/);
    const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json() as {success:boolean}).success,true);
    for(const route of ['/api/missing','/api/must-not-serve.txt','/.env','/assets/missing.js']){
      const response=await fetch(base+route,{headers:{Accept:'text/html'}});assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/BerylCore test|fixture/);
    }
    assert.equal((await fetch(base+'/account',{method:'POST'})).status,404);
    assert.equal((await fetch(base+'/unknown',{headers:{Accept:'application/json'}})).status,404);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
