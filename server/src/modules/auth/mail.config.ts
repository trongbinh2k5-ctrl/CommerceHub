export type MailEnvironment = Record<string, string | undefined>;
const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function mailConfiguration(env: MailEnvironment = process.env) {
  const transport = env.MAIL_TRANSPORT || 'disabled';
  const from = env.MAIL_FROM?.trim() || '';
  const errors: string[] = [];
  const host = env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER?.trim() || '';
  const pass = host === 'smtp.gmail.com' ? (env.SMTP_PASS || '').replace(/\s/g, '') : env.SMTP_PASS || '';
  const sender = from.match(/<([^<>]+)>$/)?.[1] || from;
  const gmail={clientId:env.GMAIL_CLIENT_ID?.trim()||'',clientSecret:env.GMAIL_CLIENT_SECRET?.trim()||'',refreshToken:env.GMAIL_REFRESH_TOKEN?.trim()||'',user:env.GMAIL_USER?.trim()||''};
  if (!['disabled', 'resend', 'smtp', 'brevo','gmail-api'].includes(transport)) errors.push('MAIL_TRANSPORT phải là disabled, smtp, resend, brevo hoặc gmail-api.');
  if (transport !== 'disabled') {
    if (!email.test(sender) || /[\r\n]/.test(from)) errors.push('MAIL_FROM cần là email gửi hợp lệ.');
    if (transport === 'resend' && !env.RESEND_API_KEY?.trim()) errors.push('Thiếu RESEND_API_KEY.');
    if (transport === 'brevo' && !env.BREVO_API_KEY?.trim()) errors.push('Thiếu BREVO_API_KEY.');
    if(transport==='gmail-api'){
      if(!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(gmail.clientId))errors.push('Thiếu hoặc sai GMAIL_CLIENT_ID.');
      if(!gmail.clientSecret)errors.push('Thiếu GMAIL_CLIENT_SECRET.');
      if(!gmail.refreshToken)errors.push('Thiếu GMAIL_REFRESH_TOKEN.');
      if(!email.test(gmail.user))errors.push('Thiếu hoặc sai GMAIL_USER.');
      if(sender.toLowerCase()!==gmail.user.toLowerCase())errors.push('MAIL_FROM phải dùng đúng email GMAIL_USER đã cấp quyền OAuth.');
    }
    if (transport === 'smtp') {
      if (!host || /[\s/:]/.test(host)) errors.push('SMTP_HOST không hợp lệ.');
      if (![465, 587].includes(port)) errors.push('SMTP_PORT cần là 465 hoặc 587.');
      if (!email.test(user)) errors.push('Thiếu hoặc sai SMTP_USER.');
      if (!pass) errors.push('Thiếu SMTP_PASS.');
      if (host === 'smtp.gmail.com') {
        if (pass && !/^[a-zA-Z0-9]{16}$/.test(pass)) errors.push('SMTP_PASS của Gmail cần là mật khẩu ứng dụng 16 ký tự.');
        if (sender.toLowerCase() !== user.toLowerCase()) errors.push('Với Gmail demo, MAIL_FROM phải trùng SMTP_USER.');
      }
    }
  }
  return { transport, from, gmail, ready: transport !== 'disabled' && errors.length === 0, errors, smtp: { host, port, secure: port === 465, requireTLS: port === 587, auth: { user, pass }, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true, logger: false as const, debug: false } };
}
