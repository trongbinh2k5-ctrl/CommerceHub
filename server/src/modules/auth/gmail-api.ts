import nodemailer from 'nodemailer';

export const gmailSendScope='https://www.googleapis.com/auth/gmail.send';
export type GmailCredentials={clientId:string;clientSecret:string;refreshToken:string;user:string};

export async function gmailAccessToken(credentials:GmailCredentials){
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,refresh_token:credentials.refreshToken,grant_type:'refresh_token'}),
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new Error('Google OAuth rejected refresh');
  const token=await response.json() as {access_token?:unknown;token_type?:unknown;scope?:unknown};
  if(typeof token.access_token!=='string'||!token.access_token||typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer')throw new Error('Google OAuth did not issue access');
  if(typeof token.scope==='string'&&!token.scope.split(/\s+/).includes(gmailSendScope))throw new Error('Gmail send permission missing');
  return token.access_token;
}

export async function sendGmailApi(credentials:GmailCredentials,from:string,mail:{to:string;subject:string;text:string}){
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(mail.to)||/[\r\n]/.test(mail.subject))throw new Error('Invalid message headers');
  // Compose RFC 822 locally; delivery uses only HTTPS, never an SMTP connection.
  const composer=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});
  let raw:string;
  try{
    const message=await composer.sendMail({from,to:mail.to,subject:mail.subject,text:mail.text,disableFileAccess:true,disableUrlAccess:true});
    if(!Buffer.isBuffer(message.message))throw new Error('Message composition failed');
    raw=message.message.toString('base64url');
  }finally{composer.close();}
  const access=await gmailAccessToken(credentials);
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',redirect:'error',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
    body:JSON.stringify({raw}),signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new Error('Gmail API rejected message');
  const result=await response.json() as {id?:unknown};
  if(typeof result.id!=='string'||!result.id)throw new Error('Gmail API did not acknowledge message');
}
