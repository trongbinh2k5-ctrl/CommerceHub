# Nhập/xuất Excel — 09/11/2026

## Các màn hình hỗ trợ

| Màn hình quản trị | Nhập .xlsx | Xuất .xlsx |
|---|---|---|
| Thiết bị | Thêm mới hoặc cập nhật theo SKU | Danh sách, giá, thông số, tồn kho |
| Danh mục | Thêm mới hoặc cập nhật theo ID | Tên, ID, đường dẫn, mô tả, trạng thái |
| Tài khoản | Tạo STAFF; chỉ ADMIN thực hiện | Danh sách nhân viên; không chứa mật khẩu |
| Lịch sử kho | Điều chỉnh tăng/giảm theo SKU, có lý do | Lịch sử biến động kho |
| Đơn hàng | Không nhập | Đơn, người nhận, điện thoại, địa chỉ, số tiền, sản phẩm |
| Thanh toán | Không nhập | Số tiền, trạng thái, ngày thu |
| Vận chuyển | Không nhập | Mã vận đơn, đơn hàng, hãng, trạng thái |
| Đánh giá | Không nhập | Sản phẩm/đơn hàng, nội dung, số sao, trạng thái |
| Mã giảm giá | Không nhập | Giá trị, điều kiện, lượt dùng, hiệu lực |
| Tổng quan / Doanh thu theo ngày | Không nhập | Doanh thu thực thu theo ngày UTC, theo khoảng ngày |

STAFF được dùng các nghiệp vụ vận hành tương ứng; quản lý nhân viên và báo cáo doanh thu chỉ dành cho ADMIN. CSV hiện có vẫn được giữ.

## Nhập dữ liệu

### Nhập trên bảng có sẵn trong website

Trong cửa sổ **Nhập Excel**, bấm **Thêm** để mở bảng Excel có sẵn cột tương ứng với nghiệp vụ và chế độ nhập đang chọn. Nhập trực tiếp vào các ô hoặc dán vùng dữ liệu từ Excel bằng Ctrl + V. Có nút thêm/xóa dòng; Tab chuyển ô, Enter xuống dòng và Shift + Enter xuống dòng trong ô. Bảng giữ số 0 đầu của điện thoại.

Bấm **Dùng bảng này** để tạo file `.xlsx` và trở về cửa sổ nhập. Tiếp tục **Kiểm tra file → sửa lỗi nếu có → Xác nhận nhập** như khi tải file từ máy. Có thể bấm **Thêm** để mở lại bảng và sửa dữ liệu trong phiên hiện tại. Việc mở bảng hoặc tạo file chưa ghi dữ liệu vào database. Tải lại/đóng trang sẽ mất bản nháp chưa nhập.

Trong bảng sản phẩm, cuộn ngang đến **Ảnh chính** hoặc **Bộ ảnh** và bấm **Chọn ảnh từ máy** ngay tại dòng sản phẩm. Ảnh chính chọn một file; bộ ảnh có thể chọn nhiều file, tổng cộng tối đa 12 ảnh. Hỗ trợ PNG/JPEG/WebP, tối đa 5 MB mỗi ảnh. Sau khi tải, đường dẫn tự điền vào ô, có ảnh xem trước và nút xóa khỏi ô; vẫn có thể dán URL trực tiếp. Đợi tải xong rồi bấm **Dùng bảng này → Kiểm tra file → Xác nhận nhập**. Xóa ảnh khỏi bảng chỉ bỏ liên kết trong bản nháp, không xóa file đã tải trên máy chủ.

### Nhập file từ máy

1. Chọn **Nhập Excel** tại màn hình cần thao tác. Với sản phẩm/danh mục, chọn **Thêm mới** hoặc **Cập nhật** trước khi tải mẫu.
2. Bấm **Tải file mẫu**. Điền dữ liệu vào sheet `DuLieu` từ dòng 2; sheet `HuongDan` mô tả các cột. Giữ tiêu đề cột; thứ tự cột có thể thay đổi.
3. Tối đa **500 dòng/file, 5 MB**. Chỉ nhận `.xlsx`, không nhập công thức, liên kết hay đối tượng trong ô. Nội dung ô giải nén và tổng dữ liệu có giới hạn bổ sung; file quá lớn cần chia nhỏ.
4. Chọn file → **Kiểm tra file**. Xem số dòng hợp lệ/lỗi; kho có hiển thị tồn trước và sau. Có thể cuộn ngang bảng để xem đủ cột.
5. Nếu có lỗi, dùng **Tải danh sách lỗi**, sửa trong file gốc và tải lên kiểm tra lại. Chưa ghi dữ liệu trong bước này; file lỗi là báo cáo, không phải mẫu nhập lại.
6. Chỉ khi tất cả dòng hợp lệ mới có **Xác nhận nhập N dòng**. Phiên xem trước có hạn 30 phút, chỉ người đã tải file lên được xác nhận.
7. Các dòng được ghi trong cùng transaction với lịch sử và nhật ký. Nếu một dòng không hợp lệ hoặc ghi nhật ký thất bại, toàn bộ lần nhập được hoàn tác. Nếu dữ liệu đã đổi từ lúc xem trước, cần tải file lên kiểm tra lại.

Không dùng chế độ thêm mới để cập nhật bản ghi có sẵn. SKU/email trùng bị báo lỗi. Không có tự nâng quyền tài khoản đã tồn tại khi nhập nhân viên.

### Cập nhật từ file đã xuất

- Sản phẩm: xuất Excel, sửa giá/thông tin và nhập lại bằng **Cập nhật theo SKU**. Các cột ID sản phẩm, Tồn kho và Trạng thái là chỉ đọc, được bỏ qua khi nhập. Muốn thay đổi tồn, dùng **Nhập Excel điều chỉnh kho** hoặc thao tác điều chỉnh kho có lý do.
- Danh mục: xuất Excel, sửa tên/mô tả và nhập lại bằng **Cập nhật theo ID danh mục**. Đường dẫn và trạng thái trong file xuất là chỉ đọc. Khi thêm mới, backend tự sinh đường dẫn từ tên (bỏ dấu tiếng Việt); khi đổi tên, đường dẫn cũ được giữ nguyên.
- Ô trống xóa giá trị tùy chọn. Tên, SKU và giá bán vẫn phải hợp lệ.

### Tài khoản nhân viên

- Mẫu gồm Họ tên, Email, Số điện thoại. Điện thoại là ô Text để giữ số 0 đầu; không nhập cột role hoặc mật khẩu.
- Khi xác nhận nhập, ADMIN nhập mật khẩu hiện tại của mình. Hệ thống tạo mật khẩu tạm ngẫu nhiên riêng cho từng nhân viên, hết hạn sau 24 giờ và bắt đổi mật khẩu tối thiểu 10 ký tự trước khi làm việc.
- Sau khi thành công có nút **Tải thông tin đăng nhập tạm**. Thông tin này chỉ tồn tại trong phiên phản hồi đó; không nằm trong file xuất danh sách nhân viên, database bản rõ hay nhật ký.
- Tải file, bảo quản và bàn giao riêng cho đúng người. Nếu đóng trang hoặc mất kết nối trước khi lưu file, dùng chức năng cấp lại mật khẩu tạm cho tài khoản đã tạo; không nhập lại danh sách.

### Chống nhập lặp

Phiên đã nhập không thể xác nhận lại. Hệ thống cũng ghi nhận dấu vân tay nội dung (loại dữ liệu + chế độ + các ô nhập), nên cùng nội dung đã thành công sẽ bị chặn ngay cả khi đổi tên file. Với điều chỉnh kho, ghi lý do cụ thể kèm số phiếu/ngày kiểm kê để phân biệt các nghiệp vụ độc lập.

## Xuất dữ liệu

- **Trang hiện tại**: chỉ những dòng đang hiển thị; danh sách nhân viên chỉ lấy các dòng STAFF.
- **Toàn bộ kết quả đang lọc**: truy vấn ở backend, bao gồm các trang còn lại; dùng từ khóa/trạng thái tương ứng. Doanh thu dùng ngày thu tiền, các màn hình khác dùng ngày tạo nếu có bộ lọc ngày.
- Mỗi file có cột tiếng Việt theo nghiệp vụ, hàng tiêu đề, bộ lọc và cố định hàng đầu. Tiền/số lượng là số; mã/email/điện thoại là Text; ngày là giá trị ngày Excel.
- Tối đa **10.000 dòng/file xuất**; vượt giới hạn sẽ báo cần thu hẹp lọc, không âm thầm cắt dữ liệu. Doanh thu tính từ các thanh toán PAID, ngày theo UTC như dashboard hiện tại.

## Nội dung mẫu để thử

Các dòng dưới đây là dữ liệu minh họa. Điền theo đúng tên cột trong file mẫu hoặc bảng trên web; để trống các trường tùy chọn khác. SKU và email cần đổi nếu đã nhập trước đó. Không dán bảng năm cột này liên tiếp từ cột A vì các cột trong mẫu sản phẩm có thứ tự riêng.

| SKU | Tên sản phẩm | Giá bán | Tồn đầu | Ảnh chính |
|---|---|---:|---:|---|
| MAU-BP-001 | Bàn phím mẫu 01 | 450000 | 20 | /images/keyboard.jpg |
| MAU-CH-001 | Chuột mẫu 01 | 250000 | 15 | /images/mouse.jpg |

Các đường dẫn `/images/...` trên là ảnh có sẵn trong dự án. Trên Excel, cột G là Ảnh chính, cột P là Bộ ảnh và cột Q là Tồn đầu trong mẫu thêm mới hiện tại. Bộ ảnh gồm mỗi đường dẫn một dòng trong cùng ô, dùng Alt + Enter trên Excel Windows. Với ảnh riêng từ máy, tải qua nút Chọn ảnh từ máy của website rồi sao chép URL đã được điền vào ô để dùng trong Excel. Không dùng đường dẫn ổ đĩa như `C:\Anh\san-pham.jpg`.

| Họ tên | Email | Số điện thoại |
|---|---|---|
| Nhân viên mẫu 01 | nhanvien01@example.com | 0900000001 |
| Nhân viên mẫu 02 | nhanvien02@example.com | 0900000002 |

Đặt cột điện thoại là Text trước khi nhập để giữ số 0 đầu. Đây là dữ liệu thử, không phải tài khoản/liên hệ thật.

Website hiện không trích xuất ảnh nhúng hoặc công thức IMAGE trong file `.xlsx`; cột ảnh cần chứa URL dạng văn bản.

## API và kiểm chứng

- `GET /api/admin/excel/:kind/template?mode=create|update`
- `POST /api/admin/excel/:kind/preview?mode=create|update` — nội dung nhị phân với Content-Type `.xlsx`.
- `GET /api/admin/excel/batches/:id` — phiên xem trước của người tải lên.
- `GET /api/admin/excel/batches/:id/errors` — Excel báo lỗi theo dòng.
- `POST /api/admin/excel/batches/:id/commit` — xác nhận phiên đã kiểm tra; nhân viên cần `currentPassword` của admin.
- `POST /api/admin/excel/:kind/export` — JSON `scope: page|filtered`, `ids` cho trang hiện tại và `filters` cho tìm kiếm/trạng thái/ngày.

Kiểm thử nghiệp vụ: `server/tests/excel.test.ts`. Kiểm thử trình duyệt: `client/e2e/excel.spec.ts`. Tất cả thao tác ghi kiểm thử dùng MongoDB tạm, không thay dữ liệu cửa hàng thật.
