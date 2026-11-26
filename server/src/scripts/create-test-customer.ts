import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../modules/auth/user.model';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Không tạo tài khoản thử bằng script này trong production.');
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(process.env.MONGODB_URI);
  await User.init();
  const email=`cv-test-${randomBytes(4).toString('hex')}@berylcore.test`;
  const password=`Bc!${randomBytes(15).toString('base64url')}`;
  const user=await User.create({fullName:'Khách hàng kiểm thử CV',email,passwordHash:await bcrypt.hash(password,12),role:'CUSTOMER',isActive:true,emailVerifiedAt:new Date()});
  if (!await bcrypt.compare(password,(await User.findById(user._id).select('+passwordHash'))!.passwordHash)) throw new Error('Không xác nhận được mật khẩu tài khoản thử.');
  console.log('Đã tạo tài khoản CUSTOMER thử nghiệm; đánh dấu xác minh riêng tài khoản này, không gửi email.');
  console.log(`Email: ${email}`);
  console.log(`Mật khẩu: ${password}`);
  console.log('Không dùng email giả này để kiểm thử nhận thư/quên mật khẩu. Yêu cầu xác minh cho tài khoản khác không thay đổi.');
}
main().catch(error=>{console.error(error instanceof Error && ['Không tạo tài khoản thử bằng script này trong production.','Thiếu MONGODB_URI.','Không xác nhận được mật khẩu tài khoản thử.'].includes(error.message)?error.message:'Không tạo được tài khoản thử. Kiểm tra kết nối MongoDB và cấu hình trên máy.');process.exitCode=1;}).finally(()=>mongoose.disconnect());
