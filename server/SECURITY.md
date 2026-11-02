# Bảo mật backend

Cập nhật 02/11/2026.

## Các lớp bảo vệ đã bổ sung

- Helmet: CSP, chống MIME sniffing, hạn chế nhúng trang và các security header mặc định; ẩn `X-Powered-By`. HSTS bật khi `NODE_ENV=production`.
- CORS: chỉ cấp quyền đọc response trong trình duyệt cho origin có trong `CORS_ORIGINS`; không dùng wildcard hay cookie credentials. CORS không thay thế xác thực và không ngăn client ngoài trình duyệt gửi request.
- API: tối đa 300 request/IP/phút; đăng nhập 20 request/IP/15 phút; đăng ký 10 request/IP/giờ. Vượt mức trả JSON 429 và `Retry-After`. Tính cả yêu cầu thành công và thất bại.
- Không tin `X-Forwarded-For` mặc định. Chỉ bật trust proxy với các IP/CIDR khai báo rõ trong `TRUSTED_PROXIES`.
- JSON giới hạn 32 KiB; JSON lỗi trả 400 và body quá lớn trả 413 bằng thông báo cố định, không phản chiếu nội dung request.
- API trả `Cache-Control: no-store`; endpoint không tồn tại trả JSON cố định; lỗi 5xx qua error handler không đưa thông báo nội bộ cho client.
- JWT tiếp tục giới hạn HS256 và kiểm tra tài khoản trong database; bổ sung kiểm tra subject là ObjectId trước khi truy vấn.
- Đăng ký/đăng nhập giới hạn mật khẩu 72 byte UTF-8 để tránh bcrypt cắt ngầm mật khẩu nhiều byte; giới hạn email 254 ký tự và tên đăng ký 100 ký tự.
- Khi khởi động bằng `src/index.ts`, JWT secret bắt buộc tối thiểu 32 byte; production yêu cầu khai báo CORS. HTTP request timeout 30 giây và header timeout 15 giây.

## Cấu hình chạy

Tham khảo `.env.example`, giữ các secret thật trong `.env` hoặc secret manager. `.env` đã được gitignore.

1. Đặt `JWT_ACCESS_SECRET` là chuỗi ngẫu nhiên đủ mạnh, tối thiểu 32 byte. Không dùng giá trị mẫu hay mật khẩu dễ đoán. Thay secret sẽ làm token hiện hành mất hiệu lực.
2. Đặt `CORS_ORIGINS` bằng origin frontend chính xác, ví dụ `http://localhost:5173` ở local hoặc `https://shop.example` khi triển khai; nhiều origin ngăn bởi dấu phẩy, không thêm đường dẫn hay dấu `/` cuối. Nếu để trống, truy cập khác origin trong trình duyệt không được cấp quyền. Không tự sửa `.env` hiện có trong đợt này.
3. Chạy production với `NODE_ENV=production`, HTTPS tại reverse proxy và chỉ công khai cổng proxy. Nếu đứng sau proxy, khai báo đúng IP/CIDR của proxy trong `TRUSTED_PROXIES` và để proxy ghi đè các forwarded header từ client. Không đặt trust proxy thành `true`.
4. Rate limiter hiện dùng bộ nhớ mỗi tiến trình: restart làm mất bộ đếm. Khi chạy nhiều instance cần shared store (ví dụ Redis) hoặc giới hạn tương ứng tại gateway; chưa triển khai Redis vì dự án chưa có hạ tầng này.

Giới hạn tần suất có thể ảnh hưởng người dùng chung IP/NAT; điều chỉnh theo tải thực tế trước khi mở rộng. Đây là lớp chống lạm dụng cơ bản, không thay thế bảo vệ DDoS ở hạ tầng. API hiện dùng Bearer token trong header và không dùng cookie xác thực; nếu chuyển sang cookie, cần bổ sung CSRF protection phù hợp.

## Kiểm chứng

- `npm run typecheck`: đạt.
- `npm run build`: đạt.
- `npm test`: 143/143 mục đạt, gồm test cha/subtest; 0 fail, 0 skip.
- `tests/security.test.ts`: kiểm chứng security headers, CORS allowlist, JSON sai/quá lớn, giới hạn bcrypt theo byte, JWT subject sai, giới hạn đăng nhập, 404 JSON và không dùng IP giả qua `X-Forwarded-For` để vượt hạn mức.
- `npm test` đã bao gồm 19 unit test trước đây bị bỏ sót; sửa đường dẫn `test:reviews` và thêm `test:security`.
- Hai lần chạy `npm audit --json` độc lập trả 0 lỗ hổng được báo cáo. Tuy nhiên output của bước `npm install` ban đầu báo 2 lỗ hổng (1 moderate, 1 high); audit sau đó không cung cấp advisory để đối chiếu. Chưa có cơ sở khẳng định hai cảnh báo ban đầu đã được khắc phục bằng nâng cấp dependency.

Không phải kiểm toán bảo mật độc lập hay pentest; chưa xác minh cấu hình HTTPS, firewall, quyền MongoDB, secret manager hoặc giới hạn phân tán ở môi trường triển khai.

## Tài liệu tham khảo

- [Express security best practices](https://expressjs.com/advanced/best-practice-security/)
- [Helmet](https://github.com/helmetjs/helmet)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
