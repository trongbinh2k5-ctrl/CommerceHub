# VNPAY sandbox — cấu hình và tự kiểm tra

> Tài liệu lịch sử ngày 17/11/2026. Từ 19/11/2026, checkout mới chuyển sang SePay Sandbox; dùng [SEPAY-SETUP.md](SEPAY-SETUP.md). Mã xử lý VNPAY được giữ để tương thích đơn cũ. Cấu hình/kiểm thử trình duyệt VNPAY riêng bên dưới đã được thay bằng bộ SePay, không dùng để cấu hình mới.

Ngày triển khai: 17/11/2026. Chỉ tích hợp môi trường thử nghiệm, không chuyển tiền thật. COD vẫn hoạt động khi VNPAY chưa bật.

## 1. Những gì đã có

- Chọn COD hoặc VNPAY tại checkout; đơn và payment được tạo trong cùng transaction.
- Backend tính tiền từ dữ liệu cửa hàng, tạo mã giao dịch ngẫu nhiên và URL ký HMAC-SHA512, phiên bản 2.1.0.
- Mỗi payment chỉ có một lần thanh toán đang chờ; gọi lại trả cùng URL khi còn hạn.
- Trang return đọc trạng thái từ database theo tài khoản đăng nhập; không tin tham số `success`/`vnp_ResponseCode` trên trình duyệt.
- IPN công khai nhưng phải có chữ ký đúng, đúng terminal, mã tham chiếu và số tiền. Chỉ kết quả thành công hợp lệ mới ghi PAID.
- Cập nhật attempt/payment/thông báo trong transaction; thông báo lặp không ghi nhận tiền hoặc trừ kho lần nữa.
- Nút truy vấn VNPAY dùng API QUERYDR, kiểm tra chữ ký phản hồi trước khi cập nhật. Có timeout và giới hạn tần suất.
- Chặn xác nhận đơn online chưa trả tiền. Nút xác nhận thu COD trong admin chỉ dành cho COD.
- Vận chuyển chấp nhận COD đang chờ thu hoặc VNPAY đã trả tiền. Nếu hàng VNPAY hoàn về, payment vẫn PAID để đối soát hoàn tiền riêng, không tự coi là đã hoàn tiền.
- Lưu từng lần thử trong collection `vnpayattempts`; payment lưu mã giao dịch VNPAY thành công. URL đã ký được ẩn khỏi truy vấn thông thường.

## 2. Đăng ký thông tin sandbox

Đọc [giới thiệu tích hợp chính thức](https://sandbox.vnpayment.vn/apis/docs/gioi-thieu/) và làm theo liên kết đăng ký thông tin kết nối để nhận `vnp_TmnCode`, `vnp_HashSecret` của bạn. Không dùng thông tin ngân hàng thật để thử và không gửi khóa bí mật vào chat/Git.

Website chưa thể chạy giao dịch qua cổng thật nếu bạn chưa có thông tin merchant sandbox. Kiểm thử tự động sử dụng khóa giả trong môi trường cô lập, không phải bằng chứng merchant đã được VNPAY kích hoạt.

## 3. Điền vào file nào?

Mở `D:\CommerceHub\server\.env`, thêm các dòng sau và tự điền khóa trên máy:

```dotenv
VNPAY_ENABLED=true
VNPAY_TMN_CODE=<terminal sandbox của bạn>
VNPAY_HASH_SECRET=<khóa sandbox của bạn>
VNPAY_RETURN_URL=http://127.0.0.1:5173/payments/vnpay/return
```

Không để dấu `< >` trong giá trị thực. Không thay JWT, MongoDB hay SMTP đang dùng. Các tên biến đã có mẫu trong [server/.env.example](server/.env.example). Chưa muốn bật thì để `VNPAY_ENABLED=false`.

Trong terminal backend:

```powershell
cd D:\CommerceHub\server
npm run config:check
npm run dev
```

Terminal frontend chạy như cũ. `config:check` chỉ kiểm tra đủ cấu hình, chưa xác thực thông tin merchant với VNPAY.

## 4. Cấu hình địa chỉ nhận kết quả

Có hai địa chỉ khác nhau:

| Địa chỉ | Nơi xử lý | Ví dụ |
|---|---|---|
| Return URL | Frontend — trình duyệt khách quay về | `http://127.0.0.1:5173/payments/vnpay/return` |
| IPN URL | Backend — VNPAY thông báo trực tiếp | `https://<backend-public>/api/payments/vnpay/ipn` |

Đăng ký IPN trong cấu hình merchant sandbox theo hướng dẫn VNPAY. Theo tài liệu, IPN phải có SSL; server của VNPAY không truy cập được `127.0.0.1` trên máy bạn. Để thử IPN, cần backend có địa chỉ HTTPS công khai, chẳng hạn tunnel phục vụ thử nghiệm hoặc bản triển khai demo. Chưa tự mở tunnel hoặc đưa dự án lên mạng trong đợt triển khai mã này.

Nếu chỉ chạy local, return vẫn có thể hoạt động trên cùng máy; nếu thiếu IPN, dùng nút **Đã thanh toán? Kiểm tra với VNPAY** trong chi tiết đơn để backend truy vấn cổng. QUERYDR chỉ cập nhật khi nhận kết quả cuối cùng có chữ ký hợp lệ. Trên điện thoại, Return URL cũng phải là địa chỉ điện thoại truy cập được.

Tham khảo: [PAY và IPN](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [QUERYDR](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html), [FAQ về Return/IPN](https://sandbox.vnpayment.vn/apis/docs/faqs/).

## 5. Tự thử khi đã có cấu hình merchant

1. Đăng nhập khách hàng, thêm sản phẩm và địa chỉ, chọn VNPAY sandbox, xác nhận đặt hàng.
2. Website tạo đơn rồi chuyển sang cổng sandbox. Dùng thông tin thử nghiệm trong tài liệu/trang sandbox của VNPAY.
3. Thử thành công: khi backend nhận xác nhận hợp lệ, payment chuyển PAID; đơn vẫn PENDING để nhân viên xác nhận và xử lý giao hàng.
4. Thử hủy/thất bại: payment vẫn chưa trả tiền; sau khi nhận kết quả thất bại cuối cùng, có thể thanh toán lại hoặc hủy đơn.
5. Thử đóng trình duyệt tại cổng rồi mở lại chi tiết đơn: khi giao dịch còn hạn, nút thanh toán mở lại cùng giao dịch.
6. Nếu trạng thái chưa cập nhật, dùng nút truy vấn. Không tự sửa database thành PAID.

## 6. Hết hạn, đối soát và giới hạn hiện tại

- URL có hạn 15 phút. Hết hạn URL không tự chứng minh khách chưa trả tiền. Khi chưa có kết quả cuối cùng, hệ thống không tạo giao dịch thứ hai và không cho hủy để tránh tiền đến muộn sau khi hoàn tồn kho.
- Stock được trừ/giữ khi tạo đơn như luồng hiện có, không trừ lần nữa khi IPN đến. Hủy đơn chưa thanh toán và không còn giao dịch đang chờ sẽ trả tồn qua transaction hiện có.
- Chưa có tác vụ tự động quét hết hạn/QUERYDR hàng loạt. Đơn chưa rõ kết quả cần kiểm tra qua nút truy vấn và cổng merchant; nếu QUERYDR không có kết luận thì giữ chờ đối soát. Chưa có nút ép mở khóa hay ép đánh dấu PAID.
- Chỉ tự xử lý transaction status `00` (thành công) hoặc `02` (lỗi cuối cùng). Trạng thái nghi ngờ, đang xử lý, đảo giao dịch hoặc hoàn tiền cần đối soát riêng.
- Chưa triển khai API hoàn tiền. Đơn online đã PAID không dùng luồng hủy thông thường; không hứa tự động trả tiền cho khách.
- Chưa chạy giao dịch trực tiếp với merchant sandbox của bạn vì chưa có khóa. Chưa triển khai production/tiền thật.

## 7. Bản đồ mã nguồn

| File | Vai trò |
|---|---|
| [vnpay.config.ts](server/src/modules/payments/vnpay.config.ts) | Đọc cấu hình, ký/xác minh HMAC, giờ GMT+7, cố định endpoint sandbox |
| [vnpay.model.ts](server/src/modules/payments/vnpay.model.ts) | Lưu lịch sử từng lần thử thanh toán |
| [vnpay.service.ts](server/src/modules/payments/vnpay.service.ts) | Tạo URL, xử lý IPN, truy vấn QUERYDR, transaction chống xử lý trùng |
| [vnpay.router.ts](server/src/modules/payments/vnpay.router.ts) | API options, IPN, kết quả theo owner, tạo và truy vấn thanh toán |
| [order.service.ts](server/src/modules/orders/order.service.ts) | Chọn phương thức, chặn xác nhận đơn chưa trả tiền và hủy khi chờ đối soát |
| [checkout-idempotency.ts](server/src/modules/orders/checkout-idempotency.ts) | Tính cả paymentMethod vào dấu vân tay đặt hàng |
| [Account.tsx](client/src/Account.tsx) | Chọn phương thức tại checkout và hiển thị trong đơn |
| [Vnpay.tsx](client/src/Vnpay.tsx) | Chuyển sang cổng, trang kết quả, nút truy vấn lại |
| [vnpay.test.ts](server/tests/vnpay.test.ts) | Kiểm thử backend/database tạm và giả lập QUERYDR |
| [vnpay.spec.ts](client/payment-e2e/vnpay.spec.ts) | Trình duyệt đặt đơn thật trên database tạm, chặn trang cổng ngoài và gửi IPN ký bằng khóa giả |

Chạy lại kiểm thử chuyên biệt:

```powershell
cd D:\CommerceHub\server
node --import tsx --test tests/vnpay.test.ts
```

```powershell
cd D:\CommerceHub\client
npm run build
npx playwright test --config=playwright.vnpay.config.ts
```

Các kiểm thử không chuyển tiền, không gọi ngân hàng thật và không sửa database đang vận hành.

## 8. Kết quả kiểm tra ngày 17/11/2026

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ backend, gồm 14 ca trong bộ VNPAY | 297/297 đạt |
| Frontend unit tests | 21/21 đạt |
| Playwright hồi quy các chức năng hiện có | 40/40 đạt |
| Playwright VNPAY riêng | 1/1 đạt; trang cổng được intercept và IPN giả lập có chữ ký |
| Build backend / frontend | Đạt |

Log backend: [qa/vnpay-backend-tests.log](qa/vnpay-backend-tests.log). Ảnh kiểm tra điện thoại: [checkout](client/qa/vnpay/checkout-mobile.png), [chờ xác nhận](client/qa/vnpay/return-pending.png), [đã thanh toán](client/qa/vnpay/order-paid-mobile.png).

Đã kiểm chứng chữ ký sai, sửa số tiền, terminal sai, truy cập chéo tài khoản, giả thành công trên return, thông báo lặp/đồng thời, giao dịch hết hạn, QUERYDR có chữ ký sai/đúng, giao hàng sau trả tiền và hoàn hàng giữ trạng thái tiền để đối soát riêng. Đây là kiểm thử mã tích hợp với dữ liệu giả; chưa phải nghiệm thu giao dịch trực tiếp trên merchant sandbox của bạn.
