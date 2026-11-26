# Quản lý nhân viên và nhật ký — 06/11/2026

## Khách hàng đăng ký làm nhân viên — bổ sung 09/11/2026

- Khách hàng mở **Tài khoản → Đăng ký làm nhân viên**, nhập số điện thoại, vị trí mong muốn và giới thiệu/kinh nghiệm từ 20–2.000 ký tự. Họ tên và email lấy từ tài khoản hiện tại.
- Mỗi khách hàng chỉ có một đăng ký chờ duyệt. Trong thời gian chờ, tài khoản vẫn là CUSTOMER và mua hàng bình thường. Sau khi bị từ chối có thể gửi đăng ký mới; lịch sử và lý do được giữ lại.
- Admin mở **Quản trị → Tài khoản → Đăng ký làm nhân viên** phía dưới danh sách tài khoản. Có bộ lọc chờ duyệt/đã duyệt/từ chối. Từ chối cần lý do từ 10–500 ký tự, hiển thị trong tài khoản và thông báo của khách hàng.
- Duyệt đăng ký cấp STAFF cho chính tài khoản đó, thu hồi các phiên và liên kết khôi phục cũ, bắt đổi mật khẩu tối thiểu 10 ký tự. Người được duyệt đăng nhập bằng email và mật khẩu hiện tại rồi đặt mật khẩu mới trước khi làm việc. Đơn hàng cũ vẫn thuộc cùng tài khoản.
- Chỉ ADMIN được xét duyệt. Khách hàng không gửi được role/userId để nâng quyền hoặc đăng ký thay người khác; STAFF không được xem danh sách hồ sơ. Duyệt lặp hoặc tài khoản bị khóa/đã đổi vai trò trả lỗi xung đột.
- API khách hàng: `GET/POST /api/staff-applications`; API admin: `GET /api/admin/staff-applications`, `PATCH /api/admin/staff-applications/:id` với `status` APPROVED/REJECTED và `response` tùy chọn khi duyệt, bắt buộc khi từ chối. Danh sách phân trang 10 hồ sơ.
- Lưu hồ sơ, xét duyệt, thay đổi quyền, thu hồi phiên, thông báo và nhật ký trong MongoDB transaction. Index duy nhất có điều kiện ngăn hai hồ sơ chờ duyệt đồng thời.
- Kiểm thử: `server/tests/staff-applications.test.ts`, `client/e2e/staff-applications.spec.ts`; dùng database tạm, không cấp quyền cho tài khoản thật.

## Thêm nhân viên khi chưa có dịch vụ email

1. Đăng nhập admin, mở **Quản trị → Tài khoản → Thêm nhân viên**.
2. Nhập họ tên, email, số điện thoại nếu có và mật khẩu hiện tại của admin để xác nhận.
3. Hệ thống tạo tài khoản **STAFF**, mật khẩu tạm ngẫu nhiên và hạn sử dụng **24 giờ**. Không có tùy chọn tạo ADMIN từ màn hình này.
4. Mật khẩu tạm chỉ xuất hiện trong hộp thoại ngay sau khi cấp. Có nút hiện/ẩn và sao chép. Chuyển riêng thông tin cho đúng nhân viên; hệ thống không gửi email trong luồng này.
5. Nhân viên đăng nhập, được chuyển đến màn hình **Đổi mật khẩu trước khi làm việc**. Tải lại trang hoặc nhập trực tiếp URL quản trị vẫn quay về bước này.
6. Nhân viên nhập mật khẩu hiện tại/tạm và mật khẩu riêng mới ít nhất **10 ký tự**, khác mật khẩu cũ. Sau khi lưu, mọi phiên cũ bị thu hồi và nhân viên đăng nhập lại bằng mật khẩu mới.

Email trùng tài khoản đã tồn tại bị từ chối; không tự ghi đè, gộp hoặc nâng quyền người đó. Không lưu mật khẩu rõ trong database, localStorage, sessionStorage hoặc nhật ký ứng dụng. Mật khẩu tạm được tạo từ 18 byte ngẫu nhiên mật mã, lưu bằng bcrypt. Đóng hộp thoại/tải lại trang sẽ không xem lại được mật khẩu đã cấp.

## Quên hoặc hết hạn mật khẩu tạm

Admin tìm nhân viên đang hoạt động → **Cấp lại mật khẩu tạm** → nhập lý do từ 10–500 ký tự và mật khẩu admin. Mật khẩu cũ, các phiên đăng nhập và liên kết khôi phục cũ của nhân viên bị thu hồi trong cùng giao dịch. Mật khẩu tạm mới có hạn 24 giờ và tiếp tục bắt đổi trước khi vận hành.

Không cấp lại mật khẩu qua chức năng này cho CUSTOMER, ADMIN hoặc nhân viên đang bị khóa. Tài khoản khóa cần được admin xem xét mở khóa trước. Nếu dịch vụ email đã cấu hình, nhân viên vẫn có thể khôi phục qua liên kết email một lần; mật khẩu mới của STAFF/ADMIN phải đạt tối thiểu 10 ký tự.

## Phân quyền và tài khoản có sẵn

- Giữ ba vai trò ADMIN, STAFF, CUSTOMER. STAFF xử lý nghiệp vụ hiện có nhưng không quản lý tài khoản, chính sách cửa hàng, dashboard admin hoặc nhật ký quản trị.
- Tài khoản đăng ký công khai luôn là CUSTOMER; không chấp nhận trường role để tự cấp quyền.
- Admin vẫn có thể nâng tài khoản đã tồn tại lên STAFF sau khi xác nhận đúng người. Lần nâng quyền này thu hồi phiên cũ và bắt đổi mật khẩu trước khi làm việc.
- Khóa/mở khóa và đổi vai trò thu hồi phiên cũ, giữ lịch sử. Thao tác gửi lại cùng giá trị hiện có không tạo bản ghi thay đổi giả hoặc thu hồi phiên không cần thiết.
- Không được khóa/đổi quyền chính mình hoặc sửa tài khoản ADMIN bằng công cụ quản lý nhân viên. Không thay đổi tự động mật khẩu hay quyền của admin/nhân viên đang tồn tại khi triển khai bản cập nhật.
- STAFF và ADMIN có thể mở trang **Tài khoản** để tự sửa hồ sơ, đổi mật khẩu/email và quản lý phiên đăng nhập sau khi hoàn tất thiết lập. Mật khẩu mới STAFF/ADMIN tối thiểu 10 ký tự.
- Backend kiểm tra `mustChangePassword` ở mọi route cần xác thực. Phiên đang thiết lập chỉ được đọc `/api/auth/me`, đổi mật khẩu, làm mới phiên hoặc đăng xuất; không thể sửa hồ sơ, đổi email, quản lý sản phẩm/kho/đơn hàng bằng cách gọi API trực tiếp.
- Yêu cầu xác minh email toàn hệ thống vẫn được giữ. Khi bật `EMAIL_VERIFICATION_REQUIRED=true`, tài khoản chưa xác minh được hoàn tất bước mật khẩu nhưng phải xác minh email trước khi dùng chức năng vận hành. Không tự đánh dấu email của nhân viên là đã xác minh. Development hiện cho phép chưa xác minh; production cần kết nối dịch vụ email theo [COMPLETENESS.md](COMPLETENESS.md).

## Nhật ký quản trị

Mở **Quản trị → Nhật ký quản trị**. Chỉ ADMIN được xem; có lọc hành động, ngày UTC, ID đối tượng và phân trang 30 bản ghi. API còn hỗ trợ lọc `actorId`. Mỗi bản ghi có người thực hiện, thời gian, đối tượng và thay đổi trước/sau ở các trường được cho phép.

Đã ghi nhật ký cho các luồng qua API:

- Tạo nhân viên, thay đổi quyền/trạng thái, cấp lại mật khẩu tạm.
- Đổi và khôi phục mật khẩu STAFF/ADMIN; không ghi nội dung mật khẩu, hash hay token.
- Tạo, sửa, ẩn và khôi phục sản phẩm; giá và tồn kho có giá trị trước/sau. Các trường nội dung dài/bộ ảnh được ghi nhận thao tác cập nhật, không sao chép toàn bộ vào nhật ký.
- Điều chỉnh kho thủ công có lý do; sổ kho nghiệp vụ hiện có tiếp tục ghi đặt/hủy đơn.
- Xác nhận/hủy đơn, tạo/cập nhật vận đơn, xác nhận thu tiền COD.
- Thay đổi cấu hình và chính sách cửa hàng.

Bản ghi và thao tác tương ứng nằm trong cùng MongoDB transaction. Nếu ghi nhật ký thất bại thì thao tác không được lưu một phần. Xác nhận thu COD đồng thời chỉ tạo một lần thanh toán và một bản ghi nhật ký.

Không có API sửa/xóa nhật ký. Đây là nhật ký trong database ứng dụng, chưa phải hệ thống lưu trữ chống sửa ở cấp hạ tầng. Nhật ký bắt đầu từ khi triển khai bản cập nhật; không tự suy đoán người thực hiện các thay đổi trong quá khứ. Nhật ký không bao phủ thao tác sửa database trực tiếp, script ngoài API hoặc mọi module cũ như coupon/danh mục/kiểm duyệt đánh giá.

## Phạm vi kiểm chứng

Kiểm thử mới: `server/tests/staff-management.test.ts`, `client/e2e/staff-management.spec.ts` và các ca về phản hồi yêu cầu đổi mật khẩu trong `client/src/api.test.ts`.

Bao gồm tạo tài khoản trái quyền, nâng quyền trái phép, email trùng, sai mật khẩu admin, mật khẩu tạm hết hạn, gọi API bỏ qua bước thiết lập, đổi mật khẩu không hợp lệ, thu hồi access/refresh token, cấp lại mật khẩu, khóa tài khoản, phân quyền nhật ký, lọc/phân trang, xác nhận COD đồng thời và lỗi ghi nhật ký làm hoàn tác tạo nhân viên/điều chỉnh kho/đổi mật khẩu. Các thao tác ghi dùng database tạm riêng, không đổi tài khoản thật.

Chưa thêm lời mời qua email, xác thực hai lớp, chia STAFF thành nhiều bộ phận hoặc giao diện tạo ADMIN đầu tiên trong đợt ba chức năng này.

Kết quả cuối ngày 06/11/2026: **build backend/frontend thành công; 189/189 ca backend, 17/17 ca frontend, 20/20 ca E2E Edge đạt**. Đã xem ảnh chụp tạo mật khẩu tạm, thiết lập mật khẩu riêng và nhật ký trên mobile/desktop; kiểm tra bàn phím và sửa hiện tượng liên kết bỏ qua nội dung xuất hiện ngoài trạng thái focus. Ảnh tại `client/qa/staff/`. Chưa thay mật khẩu hoặc tạo nhân viên trong database thật để thử nghiệm.
