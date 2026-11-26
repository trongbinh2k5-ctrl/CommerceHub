# Bảo mật backend

Cập nhật 06/11/2026.

## Các lớp bảo vệ đã bổ sung

- Admin tạo/cấp lại mật khẩu nhân viên phải nhập lại mật khẩu hiện tại; giới hạn riêng 10 yêu cầu/IP/15 phút cho mỗi endpoint cấp. Mật khẩu tạm ngẫu nhiên có hạn 24 giờ, bcrypt, chỉ trả ở phản hồi cấp; không lưu rõ hoặc ghi vào nhật ký. STAFF/ADMIN đổi/reset mật khẩu dùng tối thiểu 10 ký tự.
- `mustChangePassword` được kiểm tra tại middleware xác thực: chỉ cho đọc tài khoản và đổi mật khẩu trong giai đoạn thiết lập; không chỉ ẩn nút ở frontend. Hết hạn mật khẩu tạm bị chặn cả đăng nhập, refresh và đổi mật khẩu qua phiên tạm. Reset bằng token email hợp lệ vẫn là luồng khôi phục riêng.
- Quản lý quyền/trạng thái, cấp lại mật khẩu và đổi mật khẩu thu hồi phiên/challenge cũ. Nhật ký cho các thao tác quan trọng được ghi trong cùng transaction; lỗi audit làm hoàn tác nghiệp vụ. Nhật ký chỉ đọc bởi ADMIN; không có API sửa/xóa. Chi tiết phạm vi trong [STAFF-MANAGEMENT.md](../STAFF-MANAGEMENT.md).

- Helmet: CSP, chống MIME sniffing, hạn chế nhúng trang và các security header mặc định; ẩn `X-Powered-By`. HSTS bật khi `NODE_ENV=production`.
- CORS: chỉ cấp quyền đọc response trong trình duyệt cho origin có trong `CORS_ORIGINS`, có credentials để dùng refresh cookie; không dùng wildcard. CORS không thay thế xác thực và không ngăn client ngoài trình duyệt gửi request.
- API: tối đa 300 request/IP/phút; đăng nhập 20 request/IP/15 phút; đăng ký 10 request/IP/giờ. Vượt mức trả JSON 429 và `Retry-After`. Tính cả yêu cầu thành công và thất bại.
- Không tin `X-Forwarded-For` mặc định. Chỉ bật trust proxy với các IP/CIDR khai báo rõ trong `TRUSTED_PROXIES`.
- JSON mặc định giới hạn 32 KiB; sản phẩm/chính sách giới hạn 96 KiB cho nội dung có nhiều trường. Upload ảnh giới hạn 5 MiB và chỉ nhận PNG/JPEG/WebP có chữ ký phù hợp. JSON lỗi trả 400 và body quá lớn trả 413, không phản chiếu nội dung request.
- API trả `Cache-Control: no-store`; endpoint không tồn tại trả JSON cố định; lỗi 5xx qua error handler không đưa thông báo nội bộ cho client.
- JWT tiếp tục giới hạn HS256 và kiểm tra tài khoản trong database; bổ sung kiểm tra subject là ObjectId trước khi truy vấn.
- Access token 15 phút ở bộ nhớ frontend; refresh cookie HttpOnly/SameSite=Lax, Secure khi production, hạn 30 ngày. Chỉ lưu hash refresh token, xoay vòng nguyên tử; kiểm tra Origin/Sec-Fetch-Site khi refresh/logout. Nên phục vụ frontend/API cùng origin.
- JWT mang mã phiên và phiên bản xác thực; middleware đối chiếu database. Đổi/reset mật khẩu, đổi email, khóa hoặc thay đổi quyền thu hồi phiên cũ. Người dùng chỉ đọc/thu hồi phiên của mình.
- Token xác minh/khôi phục ngẫu nhiên 32 byte, chỉ lưu hash, TTL và kiểm tra hết hạn ở truy vấn. Tiêu thụ một lần trong transaction, không tự xác nhận khi mở URL. Reset 30 phút; xác minh 60 phút. Giới hạn riêng các endpoint gửi/tiêu thụ token.
- Mọi yêu cầu sau mua và thông báo được giới hạn theo chủ sở hữu. Điều chỉnh kho, đặt/hủy đơn và phản hồi sau mua ghi lịch sử/thông báo trong transaction tương ứng.
- Ứng dụng mặc định giữ hạn mức API 300/IP/phút và đăng nhập 20/IP/15 phút. Riêng script demo bị giới hạn localhost/database tạm, từ chối chạy production, dùng ngân sách 10.000 API/IP/phút và 200 đăng nhập/IP/15 phút để chạy toàn bộ kiểm thử giao diện. Giới hạn đăng ký không thay đổi. Kiểm thử security dùng ứng dụng mặc định và xác nhận giới hạn đăng nhập vẫn trả 429 khi vượt mức.
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
