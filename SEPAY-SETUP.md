# SePay Sandbox — hướng dẫn cấu hình BerylCore

Chuyển từ VNPAY sang **Cổng thanh toán SePay Sandbox** ngày 19/11/2026. Không dùng Bank Hub hoặc webhook biến động số dư cho tích hợp này. Cổng sandbox không chuyển tiền thật; nghiệm thu trực tiếp phụ thuộc cấu hình merchant của bạn.

## 1. Đăng ký và lấy thông tin

1. Mở [đăng ký SePay](https://my.sepay.vn/register) hoặc đăng nhập [my.sepay.vn](https://my.sepay.vn).
2. Vào **Cổng thanh toán → Đăng ký → Bắt đầu ngay**.
3. Chọn **Bắt đầu với Sandbox → Bắt đầu hướng dẫn tích hợp**.
4. Lưu **Merchant ID** và **Secret Key** của sandbox vào nơi riêng trên máy. Merchant Secret Key chỉ hiển thị một lần; không gửi vào chat hoặc Git.
5. Vào **Cổng thanh toán → Cấu hình → IPN**, chọn Auth Type **SECRET_KEY**. Tự đặt một khóa IPN ngẫu nhiên ít nhất 32 byte và lưu lại. Đây là khóa khác với Merchant Secret Key.

Nguồn chính thức: [Sandbox](https://developer.sepay.vn/vi/cong-thanh-toan/sandbox), [Bắt đầu tích hợp](https://developer.sepay.vn/vi/cong-thanh-toan/bat-dau), [hai loại khóa và IPN](https://developer.sepay.vn/vi/cong-thanh-toan/IPN).

## 2. Nhập cấu hình ở đâu?

Mở **`D:\CommerceHub\server\.env`**, thêm hoặc sửa:

```dotenv
SEPAY_ENABLED=true
SEPAY_MERCHANT_ID=merchant_sandbox_cua_ban
SEPAY_SECRET_KEY=secret_key_sandbox_cua_ban
SEPAY_IPN_SECRET=khoa_ipn_ngau_nhien_it_nhat_32_byte
SEPAY_RETURN_URL=http://127.0.0.1:5173/payments/sepay/return
VNPAY_ENABLED=false
```

Thay các giá trị mẫu bằng thông tin thật của sandbox. `SEPAY_IPN_SECRET` phải khớp khóa bạn tự đặt ở tab IPN. Không đổi MongoDB, JWT hay SMTP. Không đặt khóa trong `client/.env` hoặc bất kỳ biến `VITE_*` nào.

Có thể tự tạo khóa IPN bằng terminal, rồi lưu trực tiếp vào `.env` và tab IPN; không gửi kết quả vào chat:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Chưa muốn bật thì để `SEPAY_ENABLED=false`; COD vẫn dùng được. Mẫu cấu hình: [server/.env.example](server/.env.example).

## 3. Các địa chỉ cần phân biệt

| Loại | Địa chỉ | Nơi cấu hình |
|---|---|---|
| Trang khách quay về | `http://127.0.0.1:5173/payments/sepay/return` | `SEPAY_RETURN_URL` trên backend |
| IPN nhận thông báo | `https://<dia-chi-backend-cong-khai>/api/payments/sepay/ipn` | SePay → Cổng thanh toán → Cấu hình → IPN |
| Cổng checkout | `https://pay-sandbox.sepay.vn/v1/checkout/init` | Cố định trong mã, form POST |
| API truy vấn | `https://pgapi-sandbox.sepay.vn/v1` | Cố định trong mã, Basic Auth ở backend |

Với Return URL công khai, backend tự gắn `ref` và kết quả điều hướng vào success/error/cancel URL khi tạo form. Không nhập URL kèm `?ref=` trong `.env`.

**Chạy local:** SePay yêu cầu callback công khai. Khi Return URL dùng localhost hoặc IP nội bộ, BerylCore tự bỏ các trường callback (chúng là tùy chọn) để tránh cổng từ chối URL. Bạn vẫn thanh toán sandbox, rồi quay lại đơn và bấm kiểm tra kết quả. Muốn tự động quay về cần cấu hình Return URL công khai; không tự mở tunnel trong mã. Nguồn: [quy tắc checkout và callback](https://developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/form-thanh-toan).

SePay phải truy cập được IPN từ Internet. `localhost`/`127.0.0.1` không phải địa chỉ IPN công khai. Khi test local, có thể dùng tunnel hoặc backend demo đã triển khai; đợt đổi mã này chưa tự mở tunnel. Nếu chưa có IPN công khai, sau thanh toán mở chi tiết đơn và dùng **Đã thanh toán? Kiểm tra với SePay** để backend truy vấn API bằng thông tin merchant.

Nếu khách mở trên điện thoại, Return URL phải là địa chỉ frontend điện thoại truy cập được. Khuyến nghị HTTPS cho IPN. Nguồn: [yêu cầu IPN](https://developer.sepay.vn/vi/cong-thanh-toan/IPN).

## 4. Chạy lại và thử luồng

Terminal backend:

```powershell
cd D:\CommerceHub\server
npm run config:check
npm run dev
```

Terminal frontend:

```powershell
cd D:\CommerceHub\client
npm run dev
```

`config:check` kiểm tra đủ trường và địa chỉ hợp lệ, chưa xác thực khóa với SePay. Chỉ dùng Merchant sandbox; code cố định endpoint sandbox và từ chối khóa có tiền tố `spsk_live_`.

1. Đăng nhập khách hàng, thêm sản phẩm và chọn địa chỉ nhận hàng.
2. Chọn **SePay · Sandbox**, bấm xác nhận đặt hàng. Backend lưu đơn/payment rồi frontend gửi form đã ký sang SePay.
3. Thực hiện luồng giả lập do sandbox cung cấp. Không chuyển tiền ngân hàng thật vào QR của môi trường thử nghiệm.
4. Khi quay về website, kết quả điều hướng không tự đánh dấu PAID. Backend chỉ cập nhật sau IPN được xác thực hoặc truy vấn API chính thức có dữ liệu khớp.
5. Nếu còn chờ, vào chi tiết đơn → **Đã thanh toán? Kiểm tra với SePay**.
6. Muốn dừng giao dịch chưa trả tiền, bấm **Dừng thanh toán đang chờ**. Backend yêu cầu hủy tại SePay rồi truy vấn lại. Chỉ khi API xác nhận CANCELLED mới mở khóa để thử lại hoặc hủy đơn hàng.
7. Đơn PAID vẫn chờ nhân viên xác nhận, sau đó tạo vận đơn và giao hàng như bình thường. Không thu COD lần nữa cho đơn SePay.

## 5. Cơ chế bảo vệ và giới hạn

- Backend lấy số tiền từ đơn đã tạo, không lấy giá từ frontend. SDK `sepay-pg-node` 1.0.0 ký theo thứ tự thuộc tính đầu vào, nên BerylCore chủ động truyền đúng thứ tự canonical của cổng: amount → merchant → currency → operation → description → invoice → payment method → các callback nếu có. Không dùng thứ tự của ví dụ SDK làm chuẩn kiểm thử độc lập.
- Invoice ngẫu nhiên, một giao dịch đang chờ trên mỗi payment. Bấm lại dùng cùng invoice; không tạo mã mới khi kết quả chưa rõ.
- IPN dùng header `X-Secret-Key`, so sánh constant-time. Đây là xác thực khóa IPN theo giao thức cổng SePay, không phải chữ ký HMAC của webhook ngân hàng.
- Chỉ nhận `ORDER_PAID`, order CAPTURED và giao dịch BANK_TRANSFER/PAYMENT/APPROVED; tiền nguyên VND và số tiền của order/transaction phải khớp.
- Transaction MongoDB cập nhật attempt/payment/thông báo cùng lúc. Khóa duy nhất trên ID giao dịch và kiểm tra replay ngăn ghi nhận trùng.
- Return chỉ đọc trạng thái thuộc tài khoản đăng nhập. Sửa `outcome=success` trên URL không thay đổi tiền.
- Khi truy vấn SePay: Basic Auth chỉ ở backend, endpoint HTTPS cố định, không theo redirect, timeout 10 giây. Lỗi mạng hoặc dữ liệu không khớp không mở khóa giao dịch.
- Đơn đang có giao dịch chờ không được hủy trực tiếp/hoàn kho. Dừng thanh toán tại cổng và hủy đơn là hai thao tác khác nhau.
- Chưa làm hoàn tiền tự động hoặc xử lý tự động `TRANSACTION_VOID`. Hàng hoàn về vẫn giữ payment PAID để đối soát tiền riêng.
- Không tự gán thời hạn 15 phút của VNPAY cho SePay. Chưa có tác vụ quét đối soát định kỳ. Nếu đơn chưa tồn tại ở phía cổng hoặc chưa có kết luận cuối cùng, giữ chờ và liên hệ cửa hàng; không ép đánh dấu đã trả tiền/đã hủy.
- Không đổi dữ liệu tài khoản, đơn cũ hoặc tồn kho trong đợt chuyển nhà cung cấp. Enum, endpoint và kiểm thử backend VNPAY được giữ cho tương thích lịch sử; giao diện checkout mới chỉ chọn COD hoặc SePay. Để `VNPAY_ENABLED=false` nếu không xử lý đơn VNPAY cũ.

## 6. Bản đồ file

| File | Nội dung |
|---|---|
| [sepay.config.ts](server/src/modules/payments/sepay.config.ts) | Cấu hình sandbox, SDK ký form, kiểm tra khóa IPN và tiền |
| [sepay.model.ts](server/src/modules/payments/sepay.model.ts) | Collection `sepayattempts`, lịch sử invoice và ID giao dịch duy nhất |
| [sepay.service.ts](server/src/modules/payments/sepay.service.ts) | Tạo thanh toán, nhận kết quả, truy vấn, dừng thanh toán |
| [sepay.router.ts](server/src/modules/payments/sepay.router.ts) | API và giới hạn thao tác theo khách hàng |
| [order.service.ts](server/src/modules/orders/order.service.ts) | Tạo đơn SEPAY, chặn hủy khi chờ/confirm khi chưa trả tiền |
| [shipping.service.ts](server/src/modules/shipping/shipping.service.ts) | Chấp nhận online đã PAID và COD đang chờ thu |
| [Sepay.tsx](client/src/Sepay.tsx) | Gửi form POST, nút truy vấn/dừng, trang kết quả |
| [Account.tsx](client/src/Account.tsx) | Chọn SePay khi checkout và hiển thị trong đơn |
| [sepay.test.ts](server/tests/sepay.test.ts) | Kiểm thử với database tạm, giả lập API SePay |
| [sepay.spec.ts](client/payment-e2e/sepay.spec.ts) | Trình duyệt đặt đơn, POST sang cổng giả lập và IPN xác thực |

Tự chạy kiểm thử:

```powershell
cd D:\CommerceHub\server
node --import tsx --test tests/sepay.test.ts
npm test
```

```powershell
cd D:\CommerceHub\client
npm run build
npx playwright test --config=playwright.sepay.config.ts
```

Các kiểm thử dùng MongoDB tạm và khóa giả, không chuyển tiền thật. Chưa nghiệm thu merchant SePay của bạn cho đến khi có thông tin sandbox và thử trực tiếp qua cổng.

## 7. Kết quả kiểm tra ngày 19/11/2026

| Bộ kiểm tra | Kết quả |
|---|---|
| Toàn bộ backend, gồm 15 ca SePay và kiểm thử tương thích VNPAY cũ | 312/312 đạt |
| Frontend unit tests | 21/21 đạt |
| Playwright hồi quy chức năng hiện có | 40/40 đạt |
| Playwright SePay riêng, gồm lỗi mở cổng và bố cục đơn chưa thanh toán | 2/2 đạt |
| Build backend và frontend | Đạt |
| npm audit khi cài SDK SePay | 0 cảnh báo |

Kiểm thử SePay riêng chặn request tới cổng bên ngoài bằng trang giả lập, xác nhận form POST có chữ ký, và gửi IPN bằng khóa giả trên database tạm. Các ca backend giả lập API SePay khi truy vấn/hủy. Chưa gọi thanh toán trực tiếp bằng merchant thật của bạn và không phát sinh tiền thật.

Ảnh đã kiểm tra trên điện thoại: [checkout](client/qa/sepay/checkout-mobile.png), [chờ xác nhận](client/qa/sepay/return-pending.png), [đã trả tiền](client/qa/sepay/order-paid-mobile.png).

Bản sửa sau phản hồi lỗi: [SEPAY-FIX-2026-11-19.md](SEPAY-FIX-2026-11-19.md). Bổ sung kiểm tra đơn chưa thanh toán tại 1280/390/320px, thông báo lỗi mở cổng, thứ tự ký theo tài liệu checkout và chế độ không gửi callback localhost.
