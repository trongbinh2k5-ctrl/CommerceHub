# Đưa BerylCore lên Render miễn phí

Frontend và API dùng chung một dịch vụ Node.js, một địa chỉ HTTPS. Database dùng MongoDB Atlas đang có; ảnh tải lên lưu trong GridFS của cùng database. Gmail SMTP trên máy vẫn dùng được tại local, còn bản Render dùng Brevo API qua HTTPS.

## 1 Đăng ký hai tài khoản

1. Mở [Render Dashboard](https://dashboard.render.com/), chọn Sign up → GitHub → Authorize Render. Vào Dashboard sau khi xác nhận email nếu có yêu cầu.
2. Mở [Brevo](https://www.brevo.com/), tạo tài khoản Free. Điền thông tin đúng với dự án cá nhân/demo. Hoàn thành quy trình kích hoạt tài khoản gửi mail của nhà cung cấp.
3. Trong Brevo, vào phần Senders, Domains & Dedicated IPs → Senders, tạo sender tên `BerylCore` với email bạn sở hữu, rồi xác minh email nhận được. Tên menu có thể thay đổi theo phiên bản dashboard.
4. Trong phần SMTP & API → API Keys, tạo API key cho BerylCore. Đây là **API key**, không phải SMTP key. Bạn sẽ nhập trực tiếp trên Render ở bước 3; không gửi key vào chat hoặc commit vào Git.

Brevo hiện có gói miễn phí 300 email/ngày. Khi dùng Gmail làm sender, Brevo có thể thay địa chỉ From bằng địa chỉ gửi thuộc hệ thống của họ; đây là phương án demo, cần kiểm tra hộp thư/thư rác. Chỉ cấu hình đủ trường chưa chứng minh tài khoản đã được duyệt gửi. [Gói Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [quy tắc sender](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).

## 2 Mã nguồn và nhánh deploy

Repo: `https://github.com/trongbinh2k5-ctrl/CommerceHub`.

Nhánh: `frontend/full-implementation`.

File `render.yaml` tại gốc repo cấu hình dịch vụ Free, Singapore, Node 24. Không chọn `server` hay `client` làm Root Directory vì build cần cả hai thư mục. Các giá trị bí mật không nằm trong YAML.

## 3 Tạo dịch vụ từ Blueprint

1. Trong Render, chọn **New → Blueprint**.
2. Kết nối GitHub nếu được yêu cầu. Chỉ cấp quyền truy cập repo CommerceHub nếu muốn giới hạn quyền.
3. Chọn repo **CommerceHub**, nhánh **frontend/full-implementation**, Blueprint Path **render.yaml**.
4. Kiểm tra dịch vụ `berylcore`, Runtime Node, Region Singapore, Plan **Free**.
5. Render sẽ hỏi các biến đánh dấu `sync: false`. Điền:

| Biến | Điền ở đâu và giá trị |
| --- | --- |
| `MONGODB_URI` | Copy trên máy từ `server/.env`, dùng cùng Atlas database với dữ liệu demo hiện tại. Không thêm dấu nháy bao quanh giá trị trong Render. |
| `MAIL_FROM` | `BerylCore <email-ban-da-xac-minh-tren-Brevo>`; thay phần email bằng sender thật. |
| `BREVO_API_KEY` | API key vừa tạo trong Brevo, nhập trực tiếp tại Render. |

6. `JWT_ACCESS_SECRET` được Render sinh ngẫu nhiên. Không dùng secret demo cố định.
7. Bấm **Deploy Blueprint**. Theo dõi Events/Logs đến khi dịch vụ Live.

Ứng dụng lấy URL HTTPS của Render để cấu hình email và origin khi không có giá trị ghi đè. Không copy nguyên `PUBLIC_APP_URL`, `CORS_ORIGINS` hoặc `SEPAY_RETURN_URL` localhost/trycloudflare cũ lên Render. Nếu dùng domain riêng sau này thì đặt lại PUBLIC_APP_URL và CORS_ORIGINS theo domain đó.

Nếu dùng **New → Web Service** thay Blueprint, điền đúng:

| Ô | Giá trị |
| --- | --- |
| Branch | `frontend/full-implementation` |
| Root Directory | Để trống |
| Runtime | Node |
| Build Command | `npm run deps:install && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

Sau đó thêm các Environment Variables giống `render.yaml`, gồm `NODE_ENV=production`, `SERVE_FRONTEND=true`, `UPLOAD_STORAGE=gridfs`, `MAIL_TRANSPORT=brevo`, `EMAIL_VERIFICATION_REQUIRED=true`, `MONGOMS_DISABLE_POSTINSTALL=1`, `TRUSTED_PROXIES=loopback,linklocal,uniquelocal`, `SEPAY_ENABLED=false`, `GHN_ENABLED=false`, `VNPAY_ENABLED=false`. Sinh JWT secret bằng chức năng Generate của dashboard nếu có. Không cần đặt PORT cố định; Render cấp PORT và app lắng nghe trên 0.0.0.0.

## 4 Cho Render truy cập MongoDB Atlas

Nếu Logs báo không kết nối được MongoDB:

1. Trong trang dịch vụ Render, mở thông tin **Outbound** ở mục Connect hoặc phần networking để lấy dải IP gửi ra của dịch vụ/region.
2. Trong Atlas, vào project đang chứa cluster → Network Access/IP Access List, thêm các dải IP Render đã công bố cho dịch vụ.
3. Trong Database Access, kiểm tra database user có quyền đọc/ghi đúng database demo và connection string dùng đúng user. Mật khẩu chứa ký tự đặc biệt cần được URL-encode trong URI.
4. Redeploy sau khi cập nhật biến môi trường. Kiểm tra Logs có `MongoDB connected successfully` rồi app mới nhận request.

## 5 Chuyển ảnh đã tải lên từ máy

Ảnh tĩnh trong `client/public` được build/deploy cùng mã nguồn. Ảnh quản trị đã tải lên trước đó nằm ở `server/var/uploads`, không đưa thư mục này lên Git.

Chạy trong terminal tại `D:\CommerceHub\server` với cấu hình Atlas hiện tại:

```powershell
npm run media:migrate
```

Đây là dry-run, chỉ báo số ảnh sẽ copy và ảnh đã có. Nếu database trên Render dùng đúng URI/database đó, chạy:

```powershell
npm run media:migrate -- --apply
```

Lệnh copy sang GridFS, giữ file gốc và giữ nguyên URL `/api/media/<uuid>.<ext>`. Chạy lại bỏ qua ảnh cùng tên/kích thước đã có. Sau khi deploy, ảnh mới cũng lưu GridFS. Ảnh vẫn tính vào dung lượng Atlas; dùng ảnh đã nén phù hợp cho demo.

## 6 Kiểm tra website đã Live

Mở URL Render thực tế được dashboard cấp; không tự đoán hostname vì tên có thể được thêm hậu tố.

1. Mở `/health`: có JSON `success: true`.
2. Mở danh mục/chi tiết sản phẩm, tải lại trang bằng F5; ảnh phải còn hiển thị.
3. Đăng ký một tài khoản của chính bạn, nhận email và bấm link trên điện thoại; link phải trỏ về URL Render.
4. Đăng nhập, tải lại trang tài khoản; thử quên mật khẩu của chính bạn.
5. Đặt một đơn demo COD, kiểm tra admin thấy đơn, huy hiệu số đỏ và duyệt/hủy đúng điều kiện.
6. Kiểm tra ảnh upload mới rồi redeploy một lần để xác nhận ảnh còn trong database.

Local và bản deploy có phiên đăng nhập riêng. Admin cũ vẫn là tài khoản trong cùng database, nhưng bạn cần đăng nhập lại trên domain mới.

## 7 Bật lại SePay và GHN sau khi có URL cố định

Blueprint khởi tạo COD, chưa tự bật thanh toán live hoặc GHN. Cấu hình local hiện có không bị thay đổi.

### SePay

Trong Environment của Render, thêm `SEPAY_ENV`, `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_IPN_SECRET` đúng môi trường, sau đó `SEPAY_ENABLED=true`. Đặt `SEPAY_RETURN_URL=https://<URL-Render-thuc-te>/payments/sepay/return` hoặc để app suy ra khi biến này chưa tồn tại. Không copy callback trycloudflare cũ.

Trong cổng SePay, cấu hình IPN `https://<URL-Render-thuc-te>/api/payments/sepay/ipn` và cùng secret xác thực. Redeploy rồi kiểm tra tùy chọn môi trường trước khi giao dịch. Xem [SEPAY-SETUP.md](SEPAY-SETUP.md).

### GHN

Thêm `GHN_ENV=staging`, `GHN_TOKEN`, `GHN_SHOP_ID`, sau đó `GHN_ENABLED=true`. Đây vẫn là môi trường test, không tạo chuyến giao thật. Xem [GHN-SETUP.md](GHN-SETUP.md).

## 8 Các giới hạn của phương án miễn phí

- Render Free có thể ngủ sau 15 phút không có truy cập; lần mở đầu có thể chậm. Tác vụ đồng bộ nền cũng không chạy trong lúc dịch vụ ngủ.
- Render Free chặn SMTP 25/465/587 và không có persistent disk. Vì vậy bản này dùng email qua HTTPS và lưu ảnh vào Atlas.
- Giữ `EMAIL_VERIFICATION_REQUIRED=true`; không tắt xác minh chỉ để che lỗi gửi mail.
- Auto-deploy tắt trong Blueprint. Khi muốn cập nhật, push đúng nhánh rồi chọn Manual Deploy → Deploy latest commit; đừng bấm Clear build cache nếu không có lỗi cần xử lý.
- Bản demo CV chưa thay cho hệ thống bán hàng production. Hạn giữ tồn kho, vận chuyển thực tế, đối soát và hoàn tiền tự động vẫn theo giới hạn đã ghi trong [tổng kiểm tra](FINAL-REVIEW-2026-11-24.md).

## 9 File đã chuẩn bị

- `render.yaml`: dịch vụ và biến môi trường không chứa secret.
- `package.json`, `.node-version`: cài dependency, build hai app và start từ gốc repo.
- `server/src/config/frontend.ts`: phục vụ frontend/SPA và CSP cho ảnh, thanh toán.
- `server/src/config/hosted-environment.ts`: lấy origin của dịch vụ hosted.
- `server/src/modules/products/media-storage.ts`: GridFS hoặc local.
- `server/src/modules/auth/mail.service.ts`: SMTP, Resend và Brevo API.
- `server/src/scripts/migrate-product-media.ts`: chuyển ảnh local sang GridFS.
- `server/tests/deployment*.test.ts`, `client/e2e-deploy`: kiểm thử cấu hình deploy và trình duyệt cùng origin.

Nguồn: [Deploy Express](https://render.com/docs/deploy-node-express-app), [giới hạn Free](https://render.com/docs/free), [biến môi trường Render](https://render.com/docs/environment-variables), [Blueprint](https://render.com/docs/blueprint-spec), [Brevo API](https://developers.brevo.com/docs/send-a-transactional-email), [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/).
