# Gửi email BerylCore bằng Gmail API qua Google Cloud

Bản Render dùng Gmail API qua HTTPS với quyền `gmail.send`. Email xác minh tài khoản và đặt lại mật khẩu được gửi từ Gmail của cửa hàng. Đây là cấu hình email của shop; khách không cần đăng nhập Google hoặc cấp quyền hộp thư. Chưa có tên miền riêng vẫn có thể dùng địa chỉ Gmail của bạn.

## 1 Tạo project và bật Gmail API

1. Mở [Google Cloud Console](https://console.cloud.google.com/), đăng nhập tài khoản quản lý dự án.
2. Ở bộ chọn project trên cùng, chọn **New Project**, đặt tên `BerylCore`, rồi **Create**.
3. Chọn đúng project BerylCore. Vào **APIs & Services → Library**, tìm **Gmail API** và bấm **Enable**.

Hướng dẫn Google: [Gmail Node.js quickstart](https://developers.google.com/workspace/gmail/api/quickstart/nodejs).

## 2 Cấu hình màn hình cấp quyền

Trong **Google Auth Platform**, hoàn thành cấu hình ứng dụng:

- **Branding**: tên `BerylCore`, email hỗ trợ và email liên hệ của bạn.
- **Audience**: với Gmail cá nhân, chọn **External**. Khi còn Testing, thêm chính Gmail sẽ gửi thư vào **Test users**.
- **Data Access**: thêm scope `https://www.googleapis.com/auth/gmail.send`.

Quyền này cho phép gửi email thay mặt bạn. Không thêm quyền đọc hoặc xóa hộp thư. Scope `gmail.send` thuộc nhóm nhạy cảm của Google; nếu mở OAuth cho người dùng khác, cần đáp ứng quy trình xác minh tương ứng. Website này chỉ dùng sự cấp quyền của tài khoản cửa hàng.

Nguồn: [OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## 3 Tạo OAuth client

1. Vào **Google Auth Platform → Clients → Create client**. Một số giao diện hiển thị **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Chọn **Web application**, tên `BerylCore Gmail`.
3. Trong **Authorized redirect URIs**, thêm đúng:

```text
https://developers.google.com/oauthplayground
```

4. Tạo client, giữ **Client ID** và **Client secret** để nhập vào công cụ Google ở bước tiếp theo và Environment của Render. Không gửi các giá trị này vào chat, không commit file credentials tải về.

Nguồn: [Tạo credentials](https://developers.google.com/workspace/guides/create-credentials).

## 4 Lấy refresh token bằng công cụ của Google

1. Mở [Google OAuth Playground](https://developers.google.com/oauthplayground), bấm bánh răng.
2. Chọn **Use your own OAuth credentials**, điền Client ID/secret của BerylCore. Chọn endpoints **Google**, access **Offline**, prompt **Consent Screen**.
3. Step 1: nhập scope `https://www.googleapis.com/auth/gmail.send`, bấm **Authorize APIs**, đăng nhập Gmail gửi thư và cấp quyền.
4. Step 2: **Exchange authorization code for tokens**. Lưu **Refresh token** vào cấu hình ở bước 5, không dùng Access token thay thế.

Nếu Google chặn cấp quyền, kiểm tra project, Test users và chính sách tài khoản. Credentials mặc định của Playground có thể khiến token bị thu hồi sau 24 giờ; dùng credentials riêng như trên. Không chia sẻ link kèm token. [OAuth Playground](https://developers.google.com/oauthplayground).

## 5 Điền Environment trên Render

`render.yaml` đã chọn `MAIL_TRANSPORT=gmail-api`. Khi tạo Blueprint hoặc chỉnh dịch vụ hiện có, điền:

| Biến | Giá trị |
| --- | --- |
| `MAIL_TRANSPORT` | `gmail-api` |
| `MAIL_FROM` | `BerylCore <gmail-cua-ban@gmail.com>` |
| `GMAIL_USER` | `gmail-cua-ban@gmail.com`, đúng Gmail cấp quyền ở bước 4 |
| `GMAIL_CLIENT_ID` | Client ID của project BerylCore |
| `GMAIL_CLIENT_SECRET` | Client secret của client đó |
| `GMAIL_REFRESH_TOKEN` | Refresh token vừa lấy bằng client đó |
| `EMAIL_VERIFICATION_REQUIRED` | `true` |

Không thêm dấu nháy bao quanh giá trị khi điền từng ô Environment. MAIL_FROM phải dùng đúng email GMAIL_USER. Với dịch vụ đã tạo thủ công, sửa các biến rồi Save/Redeploy; chỉ thay YAML không tự đổi cấu hình dịch vụ đó.

App suy ra URL gửi email từ URL Render khi chưa đặt PUBLIC_APP_URL. Nếu đặt thủ công, dùng URL HTTPS của website đã deploy, không dùng localhost hoặc tunnel cũ.

## 6 Kiểm tra trên máy trước khi gửi thật

Để kiểm tra Gmail API trên máy, mở `D:\CommerceHub\server\.env` và điền các biến ở bảng trên. Giữ nguyên database và các khóa không liên quan. Việc chỉnh file thật do bạn thực hiện; thay `.env.example` không tự kết nối Google.

Trong terminal tại `D:\CommerceHub\server`:

```powershell
npm run config:check
npm run email:verify
```

`email:verify` đổi refresh token lấy access token để kiểm tra OAuth, chưa gửi thư và không in token. Sau đó có thể chủ động chạy:

```powershell
npm run email:test
```

Lệnh gửi một email thử về MAIL_FROM; nếu có EMAIL_TEST_TO thì dùng địa chỉ kiểm tra bạn đã cấu hình. Kiểm tra Inbox, thư rác và Sent của Gmail. Sau khi deploy, thử đăng ký/quên mật khẩu bằng email bạn sở hữu; link phải quay về domain Render.

## 7 Hạn token và lỗi cần nhận biết

| Hiện tượng | Cần kiểm tra |
| --- | --- |
| `redirect_uri_mismatch` khi cấp quyền | Authorized redirect URI phải khớp chính xác URL Playground ở bước 3. |
| Tài khoản không được phép cấp quyền | Audience/Testing có thêm đúng Gmail gửi vào Test users; kiểm tra chính sách Google/tổ chức. |
| `invalid_grant` hoặc OAuth từng chạy rồi ngừng | Token có thể hết hạn/bị thu hồi, đổi mật khẩu hoặc không cùng client. Cấp lại đúng project rồi cập nhật Render. |
| OAuth thành công nhưng gửi thất bại | Gmail API đã Enable, scope có gmail.send, đúng Gmail, hạn mức và trạng thái tài khoản. |
| MAIL_FROM không khớp | Dùng cùng email ở MAIL_FROM, GMAIL_USER và tài khoản đã cấp quyền. |

**External + Testing:** Google cấp refresh token cho scope Gmail với hạn **7 ngày**. Đây là giới hạn của Google, code không tự gia hạn quyền đã hết hạn. Khi chuẩn bị demo lâu dài, kiểm tra Publishing status và yêu cầu xác minh của Google; chuyển In production nếu phù hợp rồi cấp token mới. Chuyển trạng thái không bảo đảm token vĩnh viễn: quyền vẫn có thể bị thu hồi hoặc thay đổi theo tài khoản/chính sách. [Refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

Gmail vẫn áp dụng hạn mức và chống lạm dụng. Hộp thư gửi chứa thư đã gửi; các token xác minh/link reset trong thư phải được xem là dữ liệu riêng của tài khoản cửa hàng.

## 8 Mã nguồn

- `server/src/modules/auth/gmail-api.ts`: tạo MIME, đổi token và gửi qua HTTPS tới Gmail API.
- `server/src/modules/auth/mail.config.ts`: kiểm tra cấu hình và email gửi.
- `server/src/modules/auth/mail.service.ts`: dùng adapter Gmail API khi được chọn, trả lỗi tổng quát nếu Google từ chối.
- `server/src/scripts/check-email.ts`: kiểm tra OAuth và lệnh gửi thử chủ động.
- `server/tests/gmail-api.test.ts`: cấu hình, nội dung MIME, token/scope, lỗi nhà cung cấp và header injection; mọi phản hồi Google trong test đều giả lập.

Luồng gửi dùng [messages.send](https://developers.google.com/workspace/gmail/api/guides/sending): MIME được tạo tại server và mã hóa base64url. Nodemailer ở adapter này chỉ tạo nội dung thư, không mở kết nối SMTP. [Stream transport](https://nodemailer.com/transports/stream).
