# Cấu hình GHN test và vận hành giao hàng

Ngày cập nhật: 21/11/2026. BerylCore đã có tích hợp GHN staging để xem phí, tạo vận đơn, đồng bộ trạng thái và yêu cầu hủy. Bạn chưa có Token và Shop ID nên kết nối GHN thực tế còn chờ cấu hình. Khi chưa bật GHN, vận chuyển thủ công vẫn dùng bình thường.

## 1. Chuẩn bị tài khoản test

1. Mở [Developer Portal staging](https://developer.ghn.dev), đăng nhập hoặc làm theo luồng đăng ký của GHN.
2. Trong menu tài khoản, chọn **Quản lý token**, xác thực theo yêu cầu của GHN để lấy Token API. Xem [hướng dẫn lấy Token chính thức](https://developer.ghn.vn/vi/docs/token/get-token).
3. Chuẩn bị shop test có tên, điện thoại và địa chỉ lấy hàng đầy đủ. Lấy **Shop ID** trong thông tin shop/tài khoản. Nếu chưa có shop, tạo shop trong môi trường test theo hướng dẫn GHN.

Token staging và production riêng biệt. Bản tích hợp này chỉ gọi máy chủ staging `dev-online-gateway.ghn.vn`, chưa hỗ trợ giao hàng thật. Xem [các môi trường API GHN](https://developer.ghn.vn/en/docs/getting-started/overview).

## 2. Nhập cấu hình trên máy

Mở `server/.env`, thêm hoặc sửa đúng bốn biến sau; không thay các cấu hình email, database và thanh toán đang có:

```dotenv
GHN_ENABLED=true
GHN_ENV=staging
GHN_TOKEN=TOKEN_TEST_CUA_BAN
GHN_SHOP_ID=SHOP_ID_TEST_CUA_BAN
```

Thay hai giá trị mẫu bằng thông tin thật của môi trường test. Shop ID phải là số nguyên dương. Không nhập Token vào frontend, không gửi lên chat và không commit file `.env`.

Trong terminal backend:

```powershell
cd D:\CommerceHub\server
npm run config:check
```

Thông báo **đủ cấu hình** chỉ xác nhận định dạng biến, chưa chứng minh GHN chấp nhận Token. Dừng backend bằng Ctrl+C rồi chạy lại `npm run dev`. Mở lại trang quản trị để tải cấu hình mới. Frontend vẫn chạy theo cách hiện tại.

Muốn tắt tích hợp, đặt `GHN_ENABLED=false` rồi khởi động lại backend. Nếu đã gửi yêu cầu tạo GHN chưa rõ kết quả, phải đối soát yêu cầu đó trước khi chuyển cách xử lý đơn.

## 3. Thử một đơn GHN

1. Khách đặt đơn COD hoặc hoàn tất thanh toán online. Nhân viên/admin xác nhận đơn trong mục **Đơn hàng**.
2. Vào **Quản trị → Vận chuyển**, tìm bảng **GHN · Môi trường test**.
3. Chọn đơn đã xác nhận. Danh sách hiển thị tối đa 50 đơn gần nhất; đơn đã có vận đơn sẽ bị backend từ chối tạo thêm.
4. Nhập khối lượng sau đóng gói bằng **gram** và dài/rộng/cao bằng **cm**. Dùng số đo kiện thực tế. Bản này hỗ trợ một kiện dưới 20 kg, kích thước mỗi chiều từ 1 đến 200 cm.
5. Bấm **Xem phí GHN**. Đây là bước xem trước, chưa tạo vận đơn. Kiểm tra địa chỉ người nhận và tiền thu hộ.
6. Bấm **Tạo vận đơn GHN test**. Khi thành công, mã GHN xuất hiện trong bảng vận chuyển.
7. Bấm **Đồng bộ GHN** tại dòng vận đơn để lấy trạng thái mới từ hãng. Khách xem hành trình trong chi tiết đơn hàng.
8. Nếu còn chờ lấy hàng, có thể bấm **Hủy tại GHN**. Web chỉ ghi nhận hủy khi truy vấn lại xác nhận trạng thái từ GHN.

Địa chỉ người nhận dùng tên tỉnh/thành và phường/xã theo danh mục mới của GHN. Từ 23/11/2026, form sổ địa chỉ có gợi ý theo tỉnh/thành; backend kiểm tra và chuẩn hóa địa chỉ khi lưu, đặt đơn và chuẩn bị yêu cầu GHN. Địa chỉ người gửi lấy theo shop đã cấu hình.

API sử dụng: [xem trước](https://developer.ghn.vn/vi/docs/order/preview), [tạo đơn](https://developer.ghn.vn/vi/docs/order/create), [tra theo mã đơn cửa hàng](https://developer.ghn.vn/vi/docs/order/info-by-client-code), [hủy đơn](https://developer.ghn.vn/vi/docs/order/cancel).

## 4. Tiền hàng và trạng thái

| Tình huống | Cách hệ thống xử lý |
| --- | --- |
| Đơn COD | Gửi tổng tiền đơn hàng làm số tiền thu hộ |
| Đơn online đã thanh toán | Gửi số tiền thu hộ bằng 0 |
| Phí GHN | Cửa hàng trả cho hãng; lưu riêng là chi phí nội bộ |
| Phí giao hàng khách thấy ở checkout | Vẫn theo chính sách phí cố định/miễn phí của cửa hàng; không đổi sau khi đặt đơn |
| GHN báo giao thành công | Cập nhật đơn đã giao; không tự xác nhận tiền COD đã về cửa hàng |
| Tiền COD đã được đối soát | Nhân viên/admin xác nhận đã thu tiền trong luồng quản lý đơn/thanh toán |
| Hủy vận đơn tại GHN | Chưa hủy đơn hàng hoặc hoàn tiền; xử lý đơn riêng sau khi hãng xác nhận hủy |
| Hàng hoàn về | Không tự cộng kho; kiểm hàng rồi xử lý kho. Đơn online giữ trạng thái đã thanh toán để xử lý hoàn tiền riêng |

Hiện đồng bộ bằng nút bấm, không tự cập nhật theo thời gian thực. Chạy local không cần Cloudflare cho luồng này. Webhook tự động sẽ cần cấu hình và kiểm thử khi triển khai máy chủ công khai.

## 5. Mất kết nối hoặc tạo đơn chưa rõ kết quả

Nếu GHN đã nhận đơn nhưng phản hồi bị mất, web giữ yêu cầu ở trạng thái `UNCERTAIN`. Đơn bị chặn tạo vận đơn thủ công và chặn hủy đơn hàng để tránh giao trùng hoặc hoàn kho khi hãng vẫn đang giữ đơn.

- Giữ nguyên thông số kiện; bấm **Thử tạo lại cùng mã đơn**. Backend dùng lại mã cửa hàng `BC-<id đơn hàng>` và dữ liệu đã lưu để lấy đúng vận đơn cũ.
- Nếu GHN đã có vận đơn nhưng website chưa lưu được, thao tác tạo lại cũng khôi phục vận đơn trong web.
- Không sửa trực tiếp database, thay Shop ID hoặc tạo một đơn giao khác để vượt qua trạng thái chưa rõ kết quả.
- Khi khách hủy đơn có yêu cầu tạo cũ nhưng chưa có vận đơn trong web, hệ thống khóa thử tạo lại và tra cứu mã đơn cửa hàng bên GHN. Nếu GHN xác nhận đơn không tồn tại, yêu cầu cũ được đóng để hủy đơn và hoàn kho. Nếu hãng đã có đơn chờ lấy, hệ thống yêu cầu hủy và kiểm tra lại trạng thái hãng trước. Lỗi xác thực/mất kết nối không được coi là chưa có đơn.
- Yêu cầu tạo vừa gửi cần đợi ít nhất một phút trước khi đối soát hủy; thao tác tạo đang chạy vẫn chặn hủy. Nếu Token/địa chỉ tiếp tục lỗi hoặc hãng đã nhận hàng, cần cửa hàng đối soát trực tiếp.
- Sau khi vận đơn GHN đã hủy, không tạo lại vận đơn trên cùng đơn hàng trong phiên bản này.

Lỗi trả về cho trình duyệt được lược bỏ thông tin bí mật. Chỉ nhân viên/admin được gọi chức năng GHN; thông số COD được tính lại phía server.

## 6. Khi chưa cấu hình GHN

Vào **Vận chuyển → Thêm mới**, chọn đơn đã xác nhận và nhập hãng vận chuyển, mã vận đơn, phí nội bộ. Cập nhật hành trình thủ công theo các nút trạng thái hợp lệ. Với vận đơn GHN, dùng nút đồng bộ từ hãng thay cho các nút cập nhật thủ công.

## 7. File cần biết

| File | Vai trò |
| --- | --- |
| `server/.env` | Token và Shop ID trên máy bạn |
| `server/.env.example` | Tên biến mẫu để cấu hình ở máy khác |
| `server/src/modules/shipping/ghn.config.ts` | Bật/tắt tích hợp, khóa môi trường staging |
| `server/src/modules/shipping/ghn.service.ts` | Gọi GHN, tính COD, phục hồi yêu cầu và đồng bộ trạng thái |
| `server/src/modules/shipping/ghn.model.ts` | Lưu yêu cầu và mã đơn chống tạo trùng |
| `server/src/modules/shipping/ghn.router.ts` | API dành cho nhân viên/admin và giới hạn lượt gọi |
| `server/src/modules/shipping/shipping.service.ts` | Nghiệp vụ vận chuyển chung và chặn thao tác xung đột |
| `client/src/GhnShipping.tsx` | Form kiện hàng, xem phí, tạo, đồng bộ, hủy |
| `client/src/DeliveryAddressFields.tsx` | Gợi ý tỉnh/thành và phường/xã trong sổ địa chỉ |
| `server/src/modules/addresses/address-catalog.ts` | Kiểm tra cặp tỉnh/phường, chuẩn hóa tên và kiểm tra địa chỉ chi tiết |
| `server/src/scripts/import-ghn-addresses.ts` | Cập nhật danh mục tên từ GHN staging, không lưu Token trong dữ liệu |
| `client/src/Admin.tsx` | Gắn giao diện GHN vào trang vận chuyển |
| `server/tests/ghn.test.ts` | Kiểm thử giao dịch database, mất kết nối, tạo trùng và tiền hàng |
| `client/e2e/ghn.spec.ts` | Kiểm thử thao tác giao diện và màn hình hẹp |

Chạy kiểm thử GHN riêng trong terminal backend: `npx tsx --test tests/ghn.test.ts`. Trong terminal frontend: `npx playwright test e2e/ghn.spec.ts`. Các kiểm thử này giả lập phản hồi GHN, không tạo vận đơn bên ngoài.

## 8. Giới hạn trước khi giao hàng thật

Bản hiện tại phục vụ demo local: chưa bật production, chưa in nhãn vận đơn, chưa tự nhận webhook, chưa đối soát COD với hãng. Giá trị khai bảo hiểm đang để 0 cho staging; phải thiết kế lại khai giá và chính sách bồi thường trước khi giao thiết bị thật. Kết nối bằng Token/Shop ID của bạn và một đơn staging hợp lệ là bước kiểm tra tiếp theo.

Khách có thể hủy đơn PENDING hoặc CONFIRMED trước bàn giao. Vận đơn GHN đã tạo phải được GHN xác nhận hủy trước khi hủy đơn và hoàn kho; yêu cầu UNCERTAIN được tra cứu khi khách bấm hủy. Hủy đơn đã thanh toán giữ nguyên bản ghi PAID và ghi `refundStatus=REQUESTED`. Khách gửi tài khoản nhận tiền trong chi tiết đơn; ADMIN xử lý tại **Quản trị → Hoàn tiền**, tiếp nhận để khóa tài khoản rồi chuyển khoản ngoài web và ghi nhận mã giao dịch. Khi xác nhận hoàn tất, trạng thái thành COMPLETED, khách nhận thông báo và doanh thu trừ khoản đã hoàn. Chức năng chưa tự chuyển tiền qua cổng. Chỉ hỗ trợ hoàn toàn bộ tiền cho đơn đã hủy; đổi trả sau giao cần xử lý riêng. Xem [hướng dẫn hoàn tiền](REFUND-GUIDE.md).

Danh mục địa chỉ lấy từ [tỉnh/thành mới](https://developer.ghn.vn/vi/docs/master-data/get-province-new) và [phường/xã mới](https://developer.ghn.vn/vi/docs/master-data/get-ward-new), cập nhật 23/11/2026. Chạy `npx tsx src/scripts/import-ghn-addresses.ts` trong thư mục server khi cần lấy lại danh mục bằng cấu hình GHN staging trên máy.

## 9. Kết quả kiểm thử ngày 21/11/2026

- Backend: 326/326 kiểm thử đạt. Nhóm GHN có 12 kiểm thử, gồm phục hồi sau mất kết nối, chống tạo trùng, quyền truy cập và đối chiếu COD/shop; chạy lại đạt sau khi bổ sung kiểm tra API đọc thông số kiện.
- Frontend: 21/21 kiểm thử đơn vị đạt. Build frontend và backend thành công.
- Bộ trình duyệt: 40/41 đạt lần đầu, gồm luồng GHN và kiểm tra không tràn ngang ở 1280, 390, 320 px. Một kiểm tra cũ nhầm nhãn thanh toán với trạng thái đơn đã được sửa để kiểm tra riêng hai nhãn; chạy lại tình huống đó đạt 1/1.
- `npm run config:check` đạt; GHN hiện chưa bật/chưa có đủ cấu hình. Kiểm thử tích hợp dùng phản hồi GHN giả lập và database tạm; chưa kiểm tra Token hoặc shop staging thực tế.
