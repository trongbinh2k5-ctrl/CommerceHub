# Kết nối Gmail cho BerylCore trên máy

Trạng thái kiểm tra ngày **11/11/2026**: đã nhập cấu hình Gmail; `email:verify` kết nối và xác thực SMTP thành công. Frontend 5173 và backend 5000 đang phản hồi. Chưa bắt buộc xác minh email và chưa xác nhận hoàn tất hai luồng đăng ký/khôi phục bằng email thật. Link local mở trên máy tính chạy website; việc truy cập bằng điện thoại đang để sau theo lựa chọn người dùng. Thanh toán và hãng vận chuyển để bàn sau, chưa triển khai VNPAY/GHN. Chatbot tiếp tục dùng kịch bản.

## 1. Tạo mật khẩu ứng dụng Google

1. Đăng nhập đúng Gmail bạn muốn dùng gửi email cho BerylCore.
2. Bật [Xác minh 2 bước](https://myaccount.google.com/security).
3. Mở [Mật khẩu ứng dụng](https://myaccount.google.com/apppasswords).
4. Đặt tên **BerylCore local**, tạo và sao chép mật khẩu ứng dụng 16 ký tự.

Không dùng mật khẩu đăng nhập Gmail. Không gửi mật khẩu ứng dụng vào chat, không chụp ảnh file `.env`. Google có thể không cung cấp tùy chọn này cho một số tài khoản do tổ chức quản lý, chỉ dùng khóa bảo mật hoặc bật Bảo vệ nâng cao; nếu không thấy mục này, đọc [hướng dẫn chính thức](https://support.google.com/accounts/answer/185833?hl=vi).

## 2. Điền đúng file

Mở **`D:\CommerceHub\server\.env`** trong VS Code. Các dòng còn thiếu đã được bổ sung, không thay các khóa/database hiện có. Sửa các dòng tương ứng, mỗi biến chỉ có một dòng đang hoạt động:

```dotenv
PUBLIC_APP_URL=http://127.0.0.1:5173
MAIL_TRANSPORT=smtp
MAIL_FROM="BerylCore <your.email@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your.email@gmail.com
SMTP_PASS=
EMAIL_VERIFICATION_REQUIRED=false
```

- Thay `your.email@gmail.com` ở **cả hai chỗ** bằng Gmail thật của bạn.
- Dán mật khẩu ứng dụng sau `SMTP_PASS=`. Có thể bỏ dấu cách trong nhóm ký tự Google hiển thị; mã cũng tự loại dấu cách cho Gmail.
- Giữ `MONGODB_URI`, `JWT_ACCESS_SECRET`, các biến khác như hiện có. Không chép đè toàn bộ `.env` bằng mẫu.
- Không điền gì vào `client/.env` để gửi mail. Mật khẩu chỉ ở backend.
- Dùng frontend tại **http://127.0.0.1:5173** để khớp link trong email.

**Link local phải mở trên chính máy tính đang chạy website.** Nếu mở Gmail trên điện thoại hoặc máy khác, `127.0.0.1` trỏ về thiết bị đó và thường báo kết nối bị từ chối. Cách thử ngay: mở Gmail trên máy tính đang chạy cả frontend/backend, rồi bấm link. Để dùng điện thoại cùng Wi-Fi cần bật frontend cho mạng LAN, đặt PUBLIC_APP_URL thành địa chỉ LAN của máy tính và cấu hình origin tương ứng. Nếu khác mạng/4G cần một địa chỉ công khai; cấu hình localhost không đáp ứng được.

`server/.env` đã được Git bỏ qua. `.env.example` chỉ chứa tên biến và giá trị mẫu, không được chép mật khẩu vào đó.

## 3. Kiểm tra lần lượt

Mở một terminal tại `D:\CommerceHub\server`:

```powershell
cd D:\CommerceHub\server
npm run config:check
npm run email:verify
```

`config:check` kiểm tra đủ trường, định dạng và URL, không in mật khẩu. `email:verify` kết nối và xác thực SMTP, **chưa gửi thư**. Cả hai cần thành công rồi mới tiếp tục:

```powershell
npm run email:test
```

Lệnh cuối gửi đúng **một thư thử về chính Gmail trong MAIL_FROM**. Đây là thao tác gửi email thật khi bạn tự chạy lệnh. Kiểm tra cả Hộp thư đến và Spam. Máy chủ SMTP chấp nhận thư không đồng nghĩa thư chắc chắn vào Inbox.

Các lệnh tự đọc `server/.env`; không truyền mật khẩu trong câu lệnh. Không dán nội dung `.env` khi báo lỗi. Chỉ cần báo lệnh nào thất bại và thông báo ngắn không chứa dữ liệu riêng.

## 4. Kiểm tra trên website

1. Dừng và chạy lại backend (`Ctrl+C`, sau đó `npm run dev`) để nạp cấu hình mới.
2. Mở **Quản trị → Cửa hàng**: Email phải hiện đủ cấu hình. Đây là kiểm tra cấu hình; kết nối thật được xác nhận bằng bước 3.
3. Dùng tài khoản thử với email thật bạn sở hữu: mở **Đăng nhập → Xác minh email**, yêu cầu link và kiểm tra thư. Không dùng địa chỉ giả như `binh@example.com` để thử nhận email.
4. Bấm link, kiểm tra thành công. Thử dùng lại link: hệ thống phải từ chối vì chỉ dùng một lần.
5. Mở **Quên mật khẩu**, yêu cầu link cho tài khoản thử, đặt mật khẩu mới và đăng nhập lại. Thao tác này thực sự đổi mật khẩu tài khoản đó; không thử trên admin đang dùng nếu chưa chủ định thay đổi.

Không cần bật bắt buộc xác minh để thử hai luồng này. Giữ `EMAIL_VERIFICATION_REQUIRED=false` trong giai đoạn đầu. Trước khi đổi thành `true`, cập nhật và xác minh email thật của **admin và các tài khoản cần sử dụng**, rồi mới bật và khởi động lại. Nếu bật ngay khi admin còn email giả, admin có thể không đăng nhập được.

## 5. Khi gặp lỗi

| Tình trạng | Kiểm tra |
|---|---|
| Báo chưa cấu hình | Đã lưu đúng `server/.env`, `MAIL_TRANSPORT=smtp`, có đủ MAIL_FROM/SMTP_USER/SMTP_PASS chưa? |
| Gmail từ chối xác thực | Dùng mật khẩu ứng dụng, không phải mật khẩu thường; tạo từ đúng tài khoản; mật khẩu ứng dụng cũ có thể bị thu hồi sau khi đổi mật khẩu Google |
| Không có mục mật khẩu ứng dụng | Kiểm tra xác minh hai bước và các trường hợp tài khoản bị giới hạn trong tài liệu Google |
| Timeout/kết nối lỗi | Kiểm tra mạng, VPN/firewall; giữ `smtp.gmail.com:465`; có thể dùng 587 nếu mạng chặn 465, mã sẽ bắt buộc STARTTLS |
| Thư không vào Inbox | Xem Spam, giới hạn tài khoản và thử lại sau; không gửi liên tục |
| Link mở sai website | Sửa PUBLIC_APP_URL, restart backend, yêu cầu link mới |
| Link báo không thể truy cập trên điện thoại | Link đang dùng localhost/127.0.0.1 chỉ dùng trên máy chạy web; mở Gmail trên máy tính đó hoặc cấu hình LAN nếu cùng Wi-Fi |
| Thư gửi được nhưng web vẫn báo tắt | Backend cũ chưa restart hoặc đang xem môi trường demo 4173 thay vì frontend local 5173 |

Khi không dùng nữa, thu hồi mật khẩu ứng dụng tại Google và đặt `MAIL_TRANSPORT=disabled`. Không đổi JWT hoặc xóa tài khoản để sửa lỗi SMTP.

## File nào phụ trách?

| File/lệnh | Vai trò |
|---|---|
| `server/.env` | Gmail thật và mật khẩu ứng dụng, chỉ lưu trên máy |
| `server/.env.example` | Mẫu tên biến |
| `server/src/modules/auth/mail.config.ts` | Kiểm tra trường SMTP, cổng, người gửi và TLS |
| `server/src/modules/auth/mail.service.ts` | Gửi qua SMTP/Resend; lỗi trả ra không chứa bí mật |
| `server/src/scripts/check-config.ts` | `npm run config:check` |
| `server/src/scripts/check-email.ts` | `npm run email:verify` và `npm run email:test` |
| `server/tests/mail.test.ts` | Kiểm thử bằng SMTP giả lập, không gửi thư thật |

Nguồn kỹ thuật: [Google App Passwords](https://support.google.com/accounts/answer/185833?hl=vi), [Nodemailer SMTP](https://nodemailer.com/smtp).

## Kiểm chứng mã nguồn ngày 10/11/2026

- Build backend đạt; toàn bộ backend **280/280** ca đạt, gồm **10** ca cấu hình/gửi SMTP giả lập.
- Kiểm thử trình duyệt liên quan tài khoản, khôi phục, quản lý nhân viên và Excel: **8/8** đạt.
- Kiểm tra trực tiếp `npm audit --json`: 0 lỗ hổng được báo cáo sau khi cập nhật body-parser, qs và override uuid của ExcelJS sang 11.1.1. Giữ nguyên ExcelJS 4.4.0, đã kiểm tra nhập/xuất và thao tác ảnh.
- `config:check` xác nhận cấu hình local cơ bản hợp lệ, email hiện vẫn **disabled**. Chưa kiểm tra Gmail thật, chưa gửi thư thật, chưa bắt buộc xác minh email.

Người dùng chọn đọc hướng dẫn và nhập thông tin sau. VNPAY, GHN và triển khai lên mạng chưa được thực hiện.
