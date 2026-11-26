import 'dotenv/config';
import {applyHostedDefaults} from '../config/hosted-environment';
import { ghnConfig } from '../modules/shipping/ghn.config';
import { sepayConfig,sepayReturnIsPublic } from '../modules/payments/sepay.config';
import { mailConfiguration } from '../modules/auth/mail.config';
import { verificationRequired } from '../modules/auth/mail.service';

applyHostedDefaults();
const config = mailConfiguration();
const errors = [...config.errors];
if(process.env.GHN_ENABLED==='true'&&!ghnConfig())errors.push('GHN đang bật nhưng thiếu Token/Shop ID hoặc môi trường không phải staging.');
const app = process.env.PUBLIC_APP_URL;
try { const url = new URL(app || ''); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(); }
catch { errors.push('PUBLIC_APP_URL cần là địa chỉ frontend, ví dụ http://127.0.0.1:5173.'); }
if (!process.env.MONGODB_URI) errors.push('Thiếu MONGODB_URI.');
if (Buffer.byteLength(process.env.JWT_ACCESS_SECRET || '', 'utf8') < 32) errors.push('JWT_ACCESS_SECRET cần ít nhất 32 byte.');
if (verificationRequired() && !config.ready) errors.push('Đang bắt buộc xác minh email nhưng dịch vụ gửi mail chưa sẵn sàng.');
console.log('BerylCore — kiểm tra cấu hình (không in khóa/mật khẩu)');
console.log(`Email: ${config.transport}; ${config.ready ? 'đủ cấu hình, chưa xác minh kết nối' : 'chưa sẵn sàng'}`);
console.log(`Bắt buộc xác minh email: ${verificationRequired() ? 'có' : 'không'}`);
console.log('GHN test: '+(ghnConfig()?'đủ cấu hình, chưa xác minh kết nối':'chưa bật/chưa đủ cấu hình')+'. Vận chuyển thủ công vẫn khả dụng.');
if(process.env.SEPAY_ENABLED==='true' && !sepayConfig()) errors.push('SePay đang bật nhưng thiếu/sai cấu hình SePay.');
console.log('Thanh toán: COD; SePay '+(sepayConfig()?.environment || 'chưa cấu hình')+': '+(sepayConfig()?'đủ cấu hình, chưa xác minh kết nối':'chưa bật/chưa đủ cấu hình')+'.');
if(sepayConfig()&&!sepayReturnIsPublic(sepayConfig()!.returnUrl))console.log('SePay chạy local: không gửi callback riêng tư; sau khi trả tiền, quay lại đơn và bấm kiểm tra kết quả. Muốn tự quay về cần Return URL công khai.');
if (errors.length) { errors.forEach(e => console.error('- ' + e)); process.exitCode = 1; }
else console.log('Các trường cấu hình hợp lệ. Dùng npm run email:verify để kiểm tra SMTP, email:test để gửi thử.');
