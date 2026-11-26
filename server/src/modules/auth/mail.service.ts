import nodemailer from 'nodemailer';
import { mailConfiguration } from './mail.config';
import {sendGmailApi} from './gmail-api';

export type Mail = { to: string; subject: string; text: string };
let testTransport: ((mail: Mail) => Promise<void>) | undefined;
export function setTestMailTransport(transport?: (mail: Mail) => Promise<void>) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test transport is only available in tests');
  testTransport = transport;
}
export function emailAvailable() {
  return Boolean(testTransport || mailConfiguration().ready);
}
export function verificationRequired() {
  return process.env.EMAIL_VERIFICATION_REQUIRED === 'true' || (process.env.NODE_ENV === 'production' && process.env.EMAIL_VERIFICATION_REQUIRED !== 'false');
}
export async function sendMail(mail: Mail) {
  if (testTransport) return testTransport(mail);
  if (!emailAvailable()) throw Object.assign(new Error('Dịch vụ email chưa được cấu hình. Vui lòng liên hệ cửa hàng.'), { statusCode: 503 });
  const config = mailConfiguration();
  try {
  if(config.transport==='gmail-api'){await sendGmailApi(config.gmail,config.from,mail);return;}
  if (config.transport === 'smtp') {
    const smtp = nodemailer.createTransport(config.smtp);
    try {
      const result = await smtp.sendMail({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text });
      if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP rejected message');
      return;
    } finally { smtp.close(); }
  }
  if(config.transport==='brevo'){
    const match=config.from.match(/^\s*(.*?)\s*<([^<>]+)>$/);
    const sender=match?{name:match[1].trim().replace(/^"|"$/g,''),email:match[2]}:{email:config.from};
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',redirect:'error',headers:{'api-key':process.env.BREVO_API_KEY!.trim(),'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({sender,to:[{email:mail.to}],subject:mail.subject,textContent:mail.text}),signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)throw new Error('Mail provider rejected message');
    const result=await response.json() as {messageId?:unknown};
    if(typeof result.messageId!=='string'||!result.messageId)throw new Error('Mail provider did not acknowledge message');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect:'error', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Mail provider rejected message');
  const result=await response.json() as {id?:unknown};
  if(typeof result.id!=='string'||!result.id)throw new Error('Mail provider did not acknowledge message');
  } catch {
    // Never leak SMTP authentication responses, addresses, tokens or provider payloads.
    throw Object.assign(new Error('Chưa gửi được email. Kiểm tra cấu hình dịch vụ hoặc thử lại sau.'), { statusCode: 503 });
  }
}
