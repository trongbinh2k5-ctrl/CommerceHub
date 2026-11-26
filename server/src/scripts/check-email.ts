import 'dotenv/config';
import nodemailer from 'nodemailer';
import { mailConfiguration } from '../modules/auth/mail.config';
import {validEmail} from '../modules/auth/account.service';
import { sendMail } from '../modules/auth/mail.service';
import {gmailAccessToken} from '../modules/auth/gmail-api';

async function main() {
  const config = mailConfiguration();
  if (!config.ready) { console.error('Email chưa sẵn sàng. Kiểm tra MAIL_TRANSPORT, MAIL_FROM và khóa dịch vụ/mật khẩu ứng dụng trong cấu hình máy chủ.'); process.exitCode = 1; return; }
  if (process.argv.includes('--send')) {
    // Recipient is configured locally by the operator; this is never an API override.
    const recipient = process.env.EMAIL_TEST_TO?.trim() || config.from.match(/<([^<>]+)>$/)?.[1] || config.from;
    if(!validEmail(recipient))throw new Error('Invalid test recipient');
    if(config.transport==='resend'&&/@resend\.dev$/i.test(recipient)&&!process.env.EMAIL_TEST_TO?.trim()){
      console.error('Đặt EMAIL_TEST_TO bằng email đăng ký Resend của bạn để nhận thư thử.');process.exitCode=1;return;
    }
    await sendMail({ to: recipient, subject: 'BerylCore — kiểm tra kết nối email', text: 'Email thử từ BerylCore. Kết nối gửi mail đã được máy chủ chấp nhận. Không có mật khẩu hoặc dữ liệu khách hàng trong email này.' });
    console.log('Máy chủ đã chấp nhận email thử gửi tới địa chỉ kiểm tra đã cấu hình. Kiểm tra hộp thư và thư rác.');
    return;
  }
  if(config.transport==='brevo'){
    const response=await fetch('https://api.brevo.com/v3/account',{headers:{'api-key':process.env.BREVO_API_KEY!.trim()},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error();
    console.log('Brevo API chấp nhận khóa. Chưa gửi email; trạng thái sender/tài khoản cần kiểm tra trong Brevo.');return;
  }
  if(config.transport==='gmail-api'){
    await gmailAccessToken(config.gmail);
    console.log('Google OAuth đã cấp access token từ refresh token. Chưa gửi email; dùng email:test để kiểm tra Gmail API.');return;
  }
  if (config.transport !== 'smtp') { console.error('Với Resend, dùng email:test.'); process.exitCode = 1; return; }
  const smtp = nodemailer.createTransport(config.smtp);
  try { await smtp.verify(); console.log('Kết nối và xác thực SMTP thành công. Chưa gửi email; dùng npm run email:test để gửi thử.'); }
  finally { smtp.close(); }
}
main().catch(() => { console.error('Kiểm tra email thất bại. Kiểm tra mạng, cấu hình dịch vụ và trạng thái sender; không gửi khóa hoặc mật khẩu vào chat.'); process.exitCode = 1; });
