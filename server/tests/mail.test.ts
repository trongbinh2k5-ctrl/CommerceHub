import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { mailConfiguration } from '../src/modules/auth/mail.config';
import { emailAvailable, sendMail } from '../src/modules/auth/mail.service';

const valid = { MAIL_TRANSPORT: 'smtp', MAIL_FROM: 'BerylCore <demo@gmail.com>', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'demo@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' };
test('Gmail config validates TLS, sender and app password without guessing readiness', () => {
  const c = mailConfiguration(valid);
  assert.equal(c.ready, true); assert.equal(c.smtp.secure, true); assert.equal(c.smtp.auth.pass, 'abcdefghijklmnop');
  assert.equal(c.smtp.logger, false); assert.equal(c.smtp.debug, false);
  assert.equal(c.smtp.disableUrlAccess, true); assert.equal(c.smtp.disableFileAccess, true);
  const startTLS = mailConfiguration({ ...valid, SMTP_PORT: '587' });
  assert.equal(startTLS.ready, true); assert.equal(startTLS.smtp.secure, false); assert.equal(startTLS.smtp.requireTLS, true);
});
for (const [key, value] of [['SMTP_USER',''], ['SMTP_PASS',''], ['SMTP_PASS','normal-password'], ['SMTP_PORT','25'], ['MAIL_FROM','different@gmail.com'], ['MAIL_FROM','Bad\r\nX: header <demo@gmail.com>'], ['MAIL_TRANSPORT','unknown']]) test('mail rejects invalid ' + key + ':' + (key === 'SMTP_PASS' ? 'redacted' : value.replace(/[\r\n]/g, '')), () => {
  const c = mailConfiguration({ ...valid, [key]: value });
  assert.equal(c.ready, false); assert.ok(c.errors.length > 0);
  assert.ok(!c.errors.join(' ').includes('abcdefghijklmnop'));
});
test('disabled mail and existing Resend remain supported', () => {
  assert.equal(mailConfiguration({}).ready, false);
  assert.equal(mailConfiguration({ MAIL_TRANSPORT: 'disabled', ...Object.fromEntries(Object.entries(valid).filter(([k]) => k !== 'MAIL_TRANSPORT')) }).ready, false);
  assert.equal(mailConfiguration({ MAIL_TRANSPORT: 'resend', MAIL_FROM: 'BerylCore <sender@example.com>', RESEND_API_KEY: 'test-key' }).ready, true);
});
test('SMTP delivery closes connections, requires acceptance and hides provider secrets', async t => {
  const before = { ...process.env };
  Object.assign(process.env, valid);
  let closed = 0, sends = 0, fail = false;
  const mock = t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async (mail: any) => { sends++; assert.equal(mail.from, valid.MAIL_FROM); assert.equal(mail.to, 'customer@test.local'); if (fail) throw new Error('secret=abcdefghijklmnop from SMTP'); return { accepted: ['customer@test.local'], rejected: [] }; },
    close: () => { closed++; },
  }) as any);
  try {
    assert.equal(emailAvailable(), true);
    await sendMail({ to: 'customer@test.local', subject: 'Xác minh BerylCore', text: 'One-use link' });
    assert.equal(sends, 1); assert.equal(closed, 1);
    fail = true;
    await assert.rejects(() => sendMail({ to: 'customer@test.local', subject: 'Test', text: 'Link' }), (error: any) => error.statusCode === 503 && !error.message.includes('abcdefghijklmnop'));
    assert.equal(closed, 2);
    process.env.MAIL_TRANSPORT = 'disabled';
    await assert.rejects(() => sendMail({ to: 'customer@test.local', subject: 'Test', text: 'Link' }), (error: any) => error.statusCode === 503);
    assert.equal(sends, 2);
  } finally { mock.mock.restore(); for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); }
});

test('Brevo HTTPS delivery validates credentials, sends plain text and hides provider failures',async t=>{
  const before={...process.env};
  assert.equal(mailConfiguration({MAIL_TRANSPORT:'brevo',MAIL_FROM:'BerylCore <demo@gmail.com>'}).ready,false);
  Object.assign(process.env,{MAIL_TRANSPORT:'brevo',MAIL_FROM:'BerylCore <demo@gmail.com>',BREVO_API_KEY:'fake-brevo-test-key'});
  let fail=false,ack=true,calls=0;
  t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>{
    calls++;assert.equal(url,'https://api.brevo.com/v3/smtp/email');assert.equal(options.redirect,'error');
    assert.equal((options.headers as Record<string,string>)['api-key'],'fake-brevo-test-key');
    assert.deepEqual(JSON.parse(options.body as string),{sender:{name:'BerylCore',email:'demo@gmail.com'},to:[{email:'customer@test.local'}],subject:'Test',textContent:'One-use link'});
    return new Response(JSON.stringify(fail?{message:'secret-provider-response'}:ack?{messageId:'test-id'}:{}),{status:fail?401:201});
  });
  try{
    assert.equal(emailAvailable(),true);await sendMail({to:'customer@test.local',subject:'Test',text:'One-use link'});
    fail=true;await assert.rejects(()=>sendMail({to:'customer@test.local',subject:'Test',text:'One-use link'}),(e:any)=>e.statusCode===503&&!e.message.includes('secret-provider-response'));
    fail=false;ack=false;await assert.rejects(()=>sendMail({to:'customer@test.local',subject:'Test',text:'One-use link'}),(e:any)=>e.statusCode===503);assert.equal(calls,3);
  }finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
