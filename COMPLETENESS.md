# Bổ sung chức năng CommerceHub — 04/11/2026

Trạng thái mới nhất: [tổng kiểm tra và hoàn thiện ngày 24/11/2026](QA-REPORT-2026-11-24.md). Những giới hạn email, thanh toán và vận chuyển bên dưới phản ánh đợt triển khai cũ.

Cập nhật 06/11/2026: đã bổ sung tạo nhân viên trực tiếp, cấp lại mật khẩu tạm, bắt buộc đổi mật khẩu và nhật ký quản trị. Quy trình và giới hạn tại [STAFF-MANAGEMENT.md](STAFF-MANAGEMENT.md).

Giữ bảng màu xanh dương và cam ấm đã được người dùng chọn. Không tự điền thông số SKU, địa chỉ, liên hệ hay chính sách chưa được cửa hàng xác nhận. Các kiểm thử ghi dữ liệu dùng MongoDB replica set tạm, không dùng database cửa hàng.

## Chức năng đã bổ sung

| Khu vực | Hành vi hiện tại |
| --- | --- |
| Chi tiết sản phẩm | Bộ ảnh, ảnh phóng to, model đầy đủ, thương hiệu, xuất xứ, tình trạng, thông số, phụ kiện và bảo hành theo SKU. Các SKU cùng nhóm có liên kết phiên bản; sản phẩm liên quan lấy từ dữ liệu thật. |
| Quản lý sản phẩm | Nhập/xóa thông số và bộ ảnh, quản lý nhóm phiên bản, tải ảnh PNG/JPEG/WebP tối đa 5 MB từ máy, xem trước ảnh. URL tệp được tạo ngẫu nhiên; chỉ STAFF/ADMIN được tải lên. |
| Danh mục sản phẩm | Tìm kiếm, danh mục, giá, thương hiệu, còn hàng/hết hàng, sắp xếp và phân trang. Danh sách thương hiệu chỉ lấy từ sản phẩm công khai. |
| Tài khoản khách hàng | Hồ sơ họ tên/số điện thoại, trạng thái xác minh, đổi mật khẩu, đổi email có xác nhận, danh sách thiết bị/phiên đăng nhập và thu hồi phiên. |
| Đăng ký và khôi phục | Xác minh email, gửi lại liên kết, quên/đặt lại mật khẩu. Token ngẫu nhiên chỉ lưu hash, có hạn dùng và chỉ sử dụng một lần. Không trả token trong API. |
| Phiên đăng nhập | Access token 15 phút ở bộ nhớ, refresh cookie HttpOnly 30 ngày có xoay vòng. Tải lại trang khôi phục phiên. Đổi mật khẩu, reset, đổi email và khóa/đổi quyền tài khoản thu hồi phiên cũ. |
| Checkout | Xem và áp dụng coupon trước khi đặt; thấy tiền hàng, giảm giá, phí giao hàng và tổng cuối. Báo giá không giữ tồn hoặc lượt coupon. Backend kiểm tra tổng khách đã chấp nhận; thay đổi giá/phí yêu cầu xác nhận lại. |
| Đơn hàng | Phí giao hàng lưu cùng đơn; trạng thái giao nhận có thời gian. Khách có phân trang đơn. Quản trị đơn/thanh toán có phân trang, tìm kiếm trên hệ thống và lọc trạng thái. |
| Sau mua | Khách gửi đổi trả/bảo hành cho sản phẩm trong đơn đã giao. Kiểm tra sở hữu, số lượng và ngăn yêu cầu cùng loại đang mở bị trùng. Nhân viên duyệt/từ chối/xử lý, khách xem phản hồi và lịch sử. |
| Thông báo | Tạo đơn, xác nhận, hủy, thay đổi giao hàng, xác nhận thu COD và phản hồi yêu cầu sau mua được ghi vào tài khoản; có đánh dấu đã đọc và phân trang. |
| Kho | Điều chỉnh có lý do/người thực hiện; đặt và hủy đơn có sổ biến động kho trong cùng transaction. Hàng hoàn cần kiểm tra trước khi nhập kho lại. |
| Quản lý tài khoản | ADMIN tìm tài khoản, khóa/mở, chuyển CUSTOMER/STAFF có bước xác nhận. Không tự khóa mình, thay đổi tài khoản ADMIN hoặc cấp ADMIN từ giao diện này. |
| Cửa hàng | ADMIN quản lý liên hệ, giờ làm việc, chính sách giao hàng/đổi trả/bảo hành/quyền riêng tư/điều khoản và phí cố định/ngưỡng miễn phí. Trang công khai hiển thị nội dung thực tế hoặc chưa cập nhật. |

## Kết nối email sau

Theo lựa chọn của người dùng, gửi email đang **tắt**. Form quên mật khẩu/xác minh giải thích rõ khi chưa kết nối. Không giả lập gửi thành công và không để lộ mã khôi phục ra màn hình/log.

Trong `server/.env`:

```dotenv
PUBLIC_APP_URL=https://ten-mien-cua-ban.example
MAIL_TRANSPORT=resend
MAIL_FROM=CommerceHub <dia-chi-thuoc-domain-da-xac-minh>
RESEND_API_KEY=nhap-khoa-tren-may-chu
EMAIL_VERIFICATION_REQUIRED=true
```

Cần xác minh domain/người gửi với nhà cung cấp trước. Khởi động lại backend sau khi đổi biến môi trường. `CORS_ORIGINS` chứa đúng origin frontend nếu truy cập khác origin. Khuyến nghị phục vụ frontend và `/api` qua cùng domain/proxy; production dùng HTTPS. Trang quản trị chỉ hiển thị trạng thái cấu hình, không hiển thị khóa.

Development mặc định cho phép đăng nhập chưa xác minh để tiếp tục làm việc khi chưa có dịch vụ mail. Production mặc định yêu cầu xác minh và từ chối đăng ký mới nếu chưa cấu hình gửi mail. Chỉ đặt `EMAIL_VERIFICATION_REQUIRED=false` khi người vận hành chủ động chọn cho phép tài khoản chưa xác minh.

Đổi email chỉ có hiệu lực sau khi xác nhận ở hộp thư mới. Reset mật khẩu có hạn 30 phút; xác minh email có hạn 60 phút. Gửi lại thay thế liên kết cũ. Nếu đăng ký thành công nhưng nhà cung cấp gửi thất bại, API trả tài khoản đã tạo và `emailSent:false`; khách có thể yêu cầu gửi lại.

## Những phần cần dữ liệu hoặc dịch vụ thực tế

- Nhập thông số **đúng từng SKU**, bộ ảnh chính xác, thương hiệu/model và chính sách/địa chỉ liên hệ qua quản trị. Chưa nhập thì giao diện giữ trạng thái chưa cập nhật.
- Hệ thống hiện thu **COD**. Chưa tích hợp thanh toán online, webhook ngân hàng, hóa đơn điện tử hay tự động hoàn tiền.
- Vận đơn/trạng thái do nhân viên nhập. Chưa kết nối API hãng vận chuyển, tra phí theo địa chỉ hay theo dõi ngoài hệ thống.
- Luồng yêu cầu sau mua phục vụ tiếp nhận và phản hồi. Trạng thái “Đã giải quyết” không tự chuyển tiền hoặc nhập kho; các thao tác thực tế phải được nhân viên đối soát.
- Phí vận chuyển chưa cấu hình thì hệ thống đang tính 0 ₫ và ghi rõ chính sách chưa cập nhật. Cần công bố phí/chính sách trước khi mở bán thật.
- Ảnh tải lên mặc định lưu `server/var/uploads` khi chạy từ `server`; đặt `UPLOAD_DIRECTORY` để dùng ổ lưu trữ bền vững và đưa vào backup. Chưa có tự dọn ảnh không còn sử dụng.
- Danh sách yêu thích, so sánh thiết bị, giỏ hàng khách vãng lai, đăng nhập xã hội, chat trực tiếp và quản lý serial/IMEI chưa nằm trong luồng hiện tại.
- Chưa triển khai hosting, kiểm thử tải, kiểm tra screen reader chuyên dụng hoặc xác nhận Safari/Firefox. Bộ kiểm thử trình duyệt dùng Edge.

## Kiểm tra

```powershell
# Trong server
npm run build
npm test
# Trong client
npm test
npm run build
npx playwright test
```

Các ca mới nằm ở `server/tests/customer-completeness.test.ts`, `client/src/api.test.ts` và `client/e2e/completeness.spec.ts`. Bộ E2E tự chạy API/database demo riêng và frontend preview. Ảnh chụp các màn hình mới nằm trong `client/qa/completeness/` sau khi chạy.

Kết quả ngày 04/11/2026: build backend/frontend đạt; **173/173 ca backend**, **15/15 ca frontend**, **19/19 ca E2E Edge** đạt. Đã chạy lại riêng **14/14 ca** của bộ kiểm tra chức năng mới sau khi bổ sung chặn phiên chưa xác minh khi bật yêu cầu xác minh. Kiểm tra storefront đang chạy bằng thao tác chỉ đọc **1/1 đạt**. Các lần chạy trước đã phát hiện và sửa origin khôi phục phiên, nhãn chữ nhỏ trên mobile, cấu hình database demo cho kiểm thử nhiều trang và fixture danh sách đơn sau khi bổ sung phân trang.

Đã xem ảnh chụp hồ sơ, hỗ trợ sau mua và chi tiết thông số trên điện thoại; các trang công khai được kiểm tra ở 320, 390, 768, 1101, 1180 và 1280px. Luồng nghiệp vụ dùng API/database tạm thật; một số tình huống bố cục dùng response dựng sẵn với tên/địa chỉ dài. Chưa gửi thư qua nhà cung cấp thật vì người dùng chưa có dịch vụ email.
