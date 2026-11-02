# Module mã giảm giá — Test 5

Module hỗ trợ `FIXED` (số tiền) và `PERCENT` (1–100%). Giá trị tiền là số nguyên theo đơn vị tiền đang dùng trong dự án. Mã được chuẩn hóa thành chữ hoa. Tổng thanh toán = tổng tiền sản phẩm − giảm giá, tối thiểu bằng 0; Payment lưu đúng tổng sau giảm giá.

## API

Các API quản trị yêu cầu token STAFF hoặc ADMIN:

- `POST /api/admin/coupons`: tạo mã.
- `GET /api/admin/coupons`: xem danh sách.
- `PATCH /api/admin/coupons/:id`: bật/tắt bằng `{ "isActive": false }`. Các thông số giảm giá khác giữ nguyên sau khi tạo.

Ví dụ tạo mã:

```json
{
  "code": "SALE50K",
  "type": "FIXED",
  "value": 50000,
  "minSubtotal": 200000,
  "maxUses": 100,
  "startsAt": "2026-11-01T00:00:00+07:00",
  "expiresAt": "2026-12-01T00:00:00+07:00",
  "isActive": true
}
```

Khách hàng checkout qua `POST /api/orders`, header `Idempotency-Key` gồm 16–128 ký tự chữ, số, `_`, `-`:

```json
{ "addressId": "<ObjectId địa chỉ của khách>", "couponCode": "SALE50K" }
```

`couponCode` là tùy chọn. Không truyền mã vẫn checkout theo luồng hiện có. Cùng khóa và nội dung trả lại đơn cũ với HTTP 200; tạo mới trả 201. Mã sai định dạng trả 400; mã hợp lệ về định dạng nhưng không đủ điều kiện sử dụng trả 409.

## Tính nhất quán

Giữ lượt, ghi lịch sử sử dụng, trừ tồn kho, tạo Order/Payment và xóa giỏ hàng cùng nằm trong transaction MongoDB. Điều kiện cập nhật nguyên tử `usedCount < maxUses` bảo vệ lượt cuối; unique partial index chặn cùng khách/mã có hai lượt chưa được hoàn. Hủy đơn qua API khách hàng hoặc quản trị hoàn lượt trong cùng transaction, có điều kiện `active: true` để chỉ hoàn một lần. Đơn đã giao hoặc trả hàng không tự hoàn mã; quy trình hiện tại chỉ hoàn khi hủy đơn thành công.

MongoDB phải hỗ trợ transaction (replica set hoặc sharded cluster), giống yêu cầu checkout hiện tại. Khi khởi động, ứng dụng chờ khởi tạo collection/index mã và lượt dùng trước khi nhận request.

## Kết quả kiểm thử

Kiểm thử tích hợp qua HTTP trên MongoDB replica set tạm, tách biệt dữ liệu ứng dụng. Không mock transaction; chỉ tiêm lỗi tại bước tạo Payment để xác minh rollback sau khi giữ lượt mã.

| # | Tình huống | Kết quả |
|---|---|---|
| 1 | Mã không tồn tại | PASS — 409 |
| 2 | Mã hết hạn | PASS — 409 |
| 3 | Chưa đến ngày áp dụng | PASS — 409 |
| 4 | Mã bị vô hiệu hóa | PASS — 409 |
| 5 | Chưa đạt minSubtotal | PASS — 409 |
| 6 | Hết lượt sử dụng | PASS — 409 |
| 7 | Khách dùng trùng mã cho hai đơn đang hiệu lực | PASS — 409 |
| 8 | Hai checkout cạnh tranh lượt cuối | PASS — một 201, một 409; đúng một lượt |
| 9 | Checkout lỗi sau giữ lượt | PASS — hoàn tác lượt, đơn, tồn kho; giỏ còn nguyên |
| 10 | Gửi lại cùng checkoutKey và nội dung | PASS — cùng đơn, không thêm lượt/Payment |
| 11 | Cùng checkoutKey, đổi couponCode | PASS — 409 |
| 12 | Hủy đơn và hủy đồng thời/lặp lại | PASS — hoàn đúng một lần, dùng lại được |
| 13 | Khách truy cập API quản trị | PASS — GET/POST/PATCH đều 403 |
| 14 | FIXED lớn hơn tổng tiền sản phẩm | PASS — Order và Payment bằng 0 |

Chạy từ thư mục dự án:

```powershell
npm run typecheck --prefix server
npm run test:coupons --prefix server
npm test --prefix server
```

Nếu dùng MongoDB đã cài thay vì tải binary, cấu hình đường dẫn thực tế trước khi chạy test:

```powershell
$env:MONGOMS_SYSTEM_BINARY = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe'
$env:MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false'
```
