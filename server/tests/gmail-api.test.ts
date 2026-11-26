import test from 'node:test';
import assert from 'node:assert/strict';
import {mailConfiguration} from '../src/modules/auth/mail.config';
import {sendMail} from '../src/modules/auth/mail.service';
import {gmailSendScope} from '../src/modules/auth/gmail-api';

const config={MAIL_TRANSPORT:'gmail-api',MAIL_FROM:'BerylCore <owner@gmail.com>',GMAIL_USER:'owner@gmail.com',GMAIL_CLIENT_ID:'fake-client.apps.googleusercontent.com',GMAIL_CLIENT_SECRET:'fake-client-secret',GMAIL_REFRESH_TOKEN:'fake-refresh-token'};
const mail={to:'customer@test.local',subject:'Xác minh tài khoản',text:'Verification code: 123456'};
async function usingConfig(action:()=>Promise<void>){const before={...process.env};Object.assign(process.env,config);try{await action();}finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}}

test('Gmail API configuration requires Google OAuth credentials and matching sender',()=>{
  assert.equal(mailConfiguration(config).ready,true);
  for(const [key,value] of [['GMAIL_CLIENT_ID','api-key'],['GMAIL_CLIENT_SECRET',''],['GMAIL_REFRESH_TOKEN',''],['GMAIL_USER',''],['MAIL_FROM','Other <other@gmail.com>'],['MAIL_FROM','Bad\r\nBcc: attacker@test.local <owner@gmail.com>']]){
    const result=mailConfiguration({...config,[key]:value});assert.equal(result.ready,false);assert.ok(result.errors.length);assert.ok(!result.errors.join().includes(config.GMAIL_REFRESH_TOKEN));
  }
});

test('Gmail uses HTTPS refresh and RFC 822 base64url delivery with unicode subjects',async t=>usingConfig(async()=>{
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>{
    calls.push(String(url));assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    if(String(url)==='https://oauth2.googleapis.com/token'){
      const body=options.body as URLSearchParams;assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('client_id'),config.GMAIL_CLIENT_ID);assert.equal(body.get('client_secret'),config.GMAIL_CLIENT_SECRET);assert.equal(body.get('refresh_token'),config.GMAIL_REFRESH_TOKEN);
      return new Response(JSON.stringify({access_token:'fake-access-token',token_type:'Bearer',scope:gmailSendScope}),{status:200});
    }
    assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal((options.headers as Record<string,string>).Authorization,'Bearer fake-access-token');
    const {raw}=JSON.parse(options.body as string);assert.match(raw,/^[A-Za-z0-9_-]+$/);
    const mime=Buffer.from(raw,'base64url').toString('utf8');assert.match(mime,/From: BerylCore <owner@gmail.com>/);assert.match(mime,/To: customer@test.local/);assert.match(mime,/Subject: =\?UTF-8\?/i);assert.match(mime,/Verification code: 123456/);assert.ok(!mime.includes('fake-access-token'));assert.ok(!mime.includes(config.GMAIL_REFRESH_TOKEN));
    return new Response(JSON.stringify({id:'gmail-test-message-id'}),{status:200});
  });
  await sendMail(mail);assert.deepEqual(calls,['https://oauth2.googleapis.com/token','https://gmail.googleapis.com/gmail/v1/users/me/messages/send']);
}));

for(const scenario of ['refresh rejected','access missing','scope missing','send rejected','ack missing'])test('Gmail rejects '+scenario+' without leaking credentials',async t=>usingConfig(async()=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url:unknown)=>{
    calls++;
    if(String(url).includes('oauth2.googleapis.com')){
      if(scenario==='refresh rejected')return new Response(JSON.stringify({error:config.GMAIL_REFRESH_TOKEN}),{status:400});
      if(scenario==='access missing')return new Response(JSON.stringify({token_type:'Bearer'}),{status:200});
      return new Response(JSON.stringify({access_token:'fake-access-token',token_type:'Bearer',scope:scenario==='scope missing'?'openid':gmailSendScope}),{status:200});
    }
    if(scenario==='send rejected')return new Response(JSON.stringify({error:config.GMAIL_CLIENT_SECRET}),{status:403});
    return new Response('{}',{status:200});
  });
  await assert.rejects(()=>sendMail(mail),(error:any)=>error.statusCode===503&&!error.message.includes(config.GMAIL_CLIENT_SECRET)&&!error.message.includes(config.GMAIL_REFRESH_TOKEN));
  assert.equal(calls,['refresh rejected','access missing','scope missing'].includes(scenario)?1:2);
}));

test('Gmail does not request an access token for injected recipient or subject headers',async t=>usingConfig(async()=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Should not call Google');});
  for(const invalid of [{...mail,to:'customer@test.local\r\nBcc: attacker@test.local'},{...mail,subject:'Subject\r\nBcc: attacker@test.local'}])await assert.rejects(()=>sendMail(invalid),(e:any)=>e.statusCode===503);
  assert.equal(calls,0);
}));
