# Tạo, thay thế, khóa và xóa tài khoản admin

Ngày hướng dẫn: **06/11/2026**. Đây là tài liệu để bạn tự thao tác; việc viết tài liệu không tạo, khóa, xóa hay đổi mật khẩu tài khoản nào.

## 1. Hiện tại dự án cho phép những gì?

| Việc | Trạng thái hiện tại |
| --- | --- |
| Khách đăng ký trên website | Luôn tạo CUSTOMER |
| Admin tạo nhân viên trên web | Có, tại Quản trị → Tài khoản → Thêm nhân viên |
| Tạo thêm ADMIN trên web | Chưa có |
| Chạy `npm run admin:create` | Chưa có lệnh này; đây mới là đề xuất trước đó |
| Khóa/xóa tài khoản ADMIN trên web | Chưa có; công cụ tài khoản chặn sửa ADMIN và chặn tự sửa quyền/trạng thái |
| Tạo admin đầu tiên hoặc thay admin bằng quyền truy cập database | Có thể thao tác bảo trì trực tiếp, theo các bước dưới đây |

Tài khoản website là document trong collection **`users`** của database mà backend đang dùng. Quyền quản trị website là trường `role: "ADMIN"`. Nó khác với tài khoản/kết nối dùng để truy cập MongoDB hoặc MongoDB Compass.

File `server/requests/products.http` chứa các request ví dụ đăng ký/đăng nhập. Xóa hoặc sửa email/mật khẩu trong file đó **không** xóa tài khoản hoặc đổi mật khẩu đã lưu trong MongoDB. Không có file lưu mật khẩu gốc của mọi tài khoản; database lưu `passwordHash`.

## 2. Chuẩn bị và xác định đúng database

1. Mở `D:\CommerceHub\server\.env` trên máy của bạn, xem biến **`MONGODB_URI`**. Không gửi công khai nội dung file hoặc chuỗi kết nối chứa mật khẩu.
2. Kết nối đúng môi trường đó bằng MongoDB Compass, chọn đúng database ứng dụng và mở collection `users`. Không chọn database demo tạm nếu mục đích là quản lý cửa hàng thật.
3. Dùng bộ lọc bên dưới để xem những admin đang hoạt động:

   ```javascript
   { role: "ADMIN", isActive: true }
   ```

4. Ghi lại email và `_id` của từng admin. `_id` là mã định danh duy nhất, thường là `ObjectId("...")`; đừng đổi `_id`.
5. Chuẩn bị bản sao lưu database có khả năng phục hồi và ghi lại những trường sẽ sửa. Tham khảo mục sao lưu trong [hướng dẫn tự vận hành](HUONG-DAN-TU-VAN-HANH.md).

Nếu muốn ngừng dùng admin hiện tại, hãy **tạo và thử đăng nhập thành công admin thay thế trước**. Giữ admin cũ hoạt động trong lúc thử admin mới. Đây là điểm dừng quan trọng: admin mới chưa vào được trang quản trị thì chưa khóa/xóa admin cũ.

## 3. Tạo admin mới bằng tài khoản đăng ký sẵn

Quy trình dưới đây dùng giao diện đăng ký để tạo mật khẩu băm đúng, sau đó dùng quyền bảo trì database để cấp ADMIN. Không chèn mật khẩu rõ vào MongoDB.

### Bước 1 — Tạo tài khoản riêng cho chủ cửa hàng

1. Chạy backend và frontend như [hướng dẫn chạy web](HUONG-DAN-TU-VAN-HANH.md).
2. Trên website, đăng xuất tài khoản đang dùng. Mở `/register`.
3. Đăng ký bằng họ tên, email thực sự thuộc chủ cửa hàng và mật khẩu riêng ít nhất **12 ký tự**, tối đa **72 byte UTF-8**. Không dùng chung mật khẩu với nhân viên hoặc ghi vào file request trong repo.
4. Tài khoản vừa đăng ký vẫn là CUSTOMER. Nếu trang tự đăng nhập sau đăng ký, hãy đăng xuất tài khoản đó trước khi bước bảo trì.
5. Nếu email đã tồn tại, không tạo bản ghi trùng. Xác định chính xác tài khoản đang có và quyền sở hữu trước khi cấp quyền; ví dụ trong tài liệu này giả sử bạn đã tạo một tài khoản mới đúng người.

### Bước 2 — Dừng backend trước khi sửa quyền

Trong terminal chạy `server`, nhấn **Ctrl + C**. Nếu nhiều tiến trình/instance backend cùng dùng database này, dừng tất cả trong thời gian bảo trì. MongoDB vẫn phải chạy để Compass kết nối được.

Việc dừng backend ngăn phát sinh phiên đăng nhập hoặc thao tác tài khoản xen giữa các bước sửa thủ công. Thao tác Compass không tự đi qua các transaction và nhật ký của API ứng dụng.

### Bước 3 — Tìm đúng tài khoản

Trong Compass → database đúng → `users` → phần Documents, lọc theo email vừa đăng ký. Ví dụ dưới đây là email minh họa, cần thay bằng email thật của bạn:

```javascript
{ email: "admin-moi@example.com" }
```

Chỉ tiếp tục khi tìm đúng **một** document. Đối chiếu họ tên, email, `_id` và ghi lại `_id` đó để lọc các phiên liên quan ở bước sau.

### Bước 4 — Sửa các trường cần thiết

Trong Compass dùng **List View** hoặc **Table View**, chọn biểu tượng bút chì/Edit document, sửa trường và bấm **Update**. Hai chế độ này cập nhật những trường thay đổi; JSON View có thể thay thế cả document nên cần tránh vô tình bỏ mất trường. [Tài liệu sửa document của MongoDB](https://www.mongodb.com/docs/compass/documents/modify/).

| Trường | Giá trị sau sửa | Ý nghĩa |
| --- | --- | --- |
| `role` | Chuỗi `ADMIN` | Cấp quyền quản trị website |
| `isActive` | Boolean `true` | Cho phép đăng nhập |
| `authVersion` | Giá trị số hiện tại cộng **1** | Làm token cũ hết hiệu lực; nếu chưa có trường thì thêm số `1` |
| `updatedAt` | Date là thời điểm bảo trì | Cập nhật dấu thời gian nếu đang theo dõi trường này |

Giữ nguyên `_id`, `passwordHash`, `emailVerifiedAt` và các dữ liệu khác. `true` phải là boolean, không phải chuỗi `"true"`; `authVersion` phải là số, không phải chuỗi. Không tự điền một ngày vào `emailVerifiedAt` để giả lập đã xác minh email.

Tài khoản mới đăng ký thông thường có `mustChangePassword: false`. Nếu đang cấp quyền cho một tài khoản có cờ yêu cầu đổi mật khẩu, hãy để người sở hữu hoàn tất bước đó; không xóa cờ chỉ để bỏ qua thiết lập.

### Bước 5 — Thu hồi phiên và liên kết cũ của đúng tài khoản

Mở lần lượt hai collection:

- `loginsessions`: các phiên đăng nhập/refresh.
- `accountchallenges`: các liên kết xác minh/khôi phục/đổi email đang chờ.

Ở mỗi collection, lọc theo `userId` bằng `_id` của tài khoản vừa cấp quyền. Thay phần chữ minh họa bằng chuỗi hex 24 ký tự thật:

```javascript
{ userId: ObjectId("THAY_BANG_ID_24_KY_TU_THAT") }
```

Đây là mẫu cần sửa trước khi dùng, không phải ObjectId hợp lệ để sao chép nguyên văn. Compass hỗ trợ dạng `ObjectId(...)` trong bộ lọc. [Tài liệu bộ lọc Compass](https://www.mongodb.com/docs/compass/query/filter/).

Kiểm tra kết quả chỉ thuộc tài khoản đó rồi xóa các document phiên/challenge tìm được. Nếu không có kết quả thì không cần xóa gì. Không xóa collection, không dùng bộ lọc trống và không xóa phiên của tất cả người dùng.

Việc tăng `authVersion` là bước làm access token cũ mất hiệu lực; xóa `loginsessions` loại bỏ refresh token, xóa `accountchallenges` loại bỏ liên kết cũ. Vì `accountchallenges` có thể chứa liên kết xác minh, nếu còn cần xác minh email thì phải yêu cầu gửi liên kết mới sau khi khởi động lại.

### Bước 6 — Khởi động lại và xác minh admin mới

```powershell
Set-Location D:\CommerceHub\server
npm run dev
```

1. Mở một cửa sổ trình duyệt riêng/tạm thời hoặc đăng xuất sạch phiên cũ, đăng nhập bằng email và mật khẩu của admin mới.
2. Mở `/admin`, kiểm tra vào được **Tổng quan**, **Tài khoản**, **Cửa hàng** và **Nhật ký quản trị**.
3. Tải lại trang, kiểm tra vẫn giữ được đăng nhập và quyền ADMIN.
4. Nếu bật `EMAIL_VERIFICATION_REQUIRED=true`, cần xác minh email thật trước khi vận hành. Production mặc định yêu cầu xác minh; khi chưa có dịch vụ email, đừng khóa admin cũ trong lúc admin mới còn bị chặn.
5. Chỉ sau khi những bước trên đạt mới tiếp tục khóa/xóa admin cũ. Ghi lại người bảo trì, thời gian, tài khoản và trường đã thay đổi trong hồ sơ bảo trì riêng; sửa trực tiếp MongoDB không tự sinh nhật ký quản trị trong ứng dụng.

## 4. Ngừng dùng admin cũ bằng cách khóa

Khóa giữ nguyên mã tài khoản nên nhật ký, vận đơn và thanh toán vẫn đối chiếu được người thực hiện. Đây là lựa chọn phù hợp nếu bạn chỉ muốn tài khoản cũ không đăng nhập được nữa.

1. Xác nhận admin thay thế đã đăng nhập và dùng được `/admin` theo mục 3.
2. Dừng tất cả backend dùng chung database trong thời gian bảo trì.
3. Trong `users`, lọc bằng **cả `_id` và email** của admin cũ, đối chiếu trước khi sửa. Nếu email đã đổi thì xác minh lại document thay vì nới lọc tùy tiện.
4. Sửa `isActive` thành boolean `false`, tăng `authVersion` thêm 1, cập nhật `updatedAt` rồi lưu. Không đổi mật khẩu hay `_id`.
5. Xóa các phiên/challenge của **đúng userId admin cũ** theo mục 3, bước 5.
6. Kiểm tra vẫn còn admin thay thế có `role: "ADMIN"` và `isActive: true`.
7. Chạy lại backend. Kiểm tra admin mới vẫn dùng được quản trị; tài khoản cũ không đăng nhập hoặc refresh được.

Để mở khóa về sau: chỉ thực hiện khi đã xác nhận đúng người và vẫn kiểm soát tài khoản; sửa `isActive: true`, tăng `authVersion`, thu hồi phiên/challenge cũ rồi thử lại. Nếu mật khẩu cũ đã bị lộ, việc chỉ mở khóa không thay thế cho đặt mật khẩu mới.

## 5. Có xóa hẳn admin được không?

**Có thể xóa document tài khoản bằng quyền truy cập database. Hiện website chưa có nút/API xóa ADMIN.** Tuy nhiên xóa hẳn có tác động khác với khóa:

- Nhật ký `actorId`, thanh toán `confirmedBy`, vận đơn `createdBy`/`updatedBy`, sổ kho hoặc tài khoản được cấp có thể đang tham chiếu `_id` đó.
- Xóa user không tự xóa các bản ghi liên quan và không tự gán chúng sang admin mới. Những tham chiếu có thể không còn hiển thị được tên người cũ; trang audit hiện xử lý bằng nhãn tài khoản không còn tồn tại.
- Không tự đổi người thực hiện trong lịch sử thành admin mới; điều đó làm sai lịch sử.
- Tạo lại một user bằng cùng email không phục hồi `_id` cũ hoặc các tham chiếu lịch sử.
- Xóa user không đồng nghĩa đã xóa mọi thông tin cá nhân có thể xuất hiện trong snapshot đơn/nhật ký. Nếu đó là mục tiêu, cần một quy trình rà soát riêng.

Nếu bạn vẫn chủ động chọn xóa hẳn:

1. Hoàn tất tạo, đăng nhập và kiểm tra admin thay thế. Có bản sao lưu phục hồi được và ghi nhận ID tài khoản sắp xóa.
2. **Khóa admin cũ trước** theo mục 4, kiểm tra admin mới vận hành được. Có thể giữ trạng thái khóa để theo dõi trước khi quyết định xóa vĩnh viễn.
3. Rà các bản ghi liên quan theo đúng `_id` cũ. Ví dụ chỉ đọc:

   ```javascript
   // Collection auditevents:
   { actorId: ObjectId("THAY_BANG_ID_24_KY_TU_THAT") }

   // Collection payments:
   { confirmedBy: ObjectId("THAY_BANG_ID_24_KY_TU_THAT") }
   ```

   Thay placeholder bằng ID thật trước khi dùng. Đây là hai ví dụ để bắt đầu; danh sách đầy đủ cần xét cả vận đơn, sổ kho, đơn/địa chỉ/đánh giá nếu tài khoản từng dùng như khách hàng và trường `provisionedBy` của người được cấp.

4. Nếu chấp nhận mất khả năng tra tên qua user cũ, dừng backend để bảo trì. Kiểm tra lại đúng database và admin thay thế vẫn đang hoạt động.
5. Tại `users`, lọc đúng `_id` và email của admin cũ, đối chiếu document rồi dùng chức năng **xóa document đơn lẻ**, xác nhận chính document đó. Không dùng Drop Collection, Drop Database hoặc xóa hàng loạt bằng bộ lọc trống. MongoDB hướng dẫn thao tác xóa trong [Delete Documents](https://www.mongodb.com/docs/manual/tutorial/delete-documents/).
6. Kiểm tra/xóa các document còn lại của đúng userId cũ trong `loginsessions` và `accountchallenges`, không xóa lịch sử tài chính/vận chuyển/nhật ký để làm mất dấu tham chiếu.
7. Chạy lại backend, kiểm tra admin mới đăng nhập được, quản trị và các màn hình lịch sử vẫn hoạt động. Ghi lại việc xóa trong hồ sơ bảo trì riêng.

Nếu ở bất kỳ bước nào chưa xác minh được admin thay thế hoặc chưa rõ dữ liệu liên quan, dừng ở trạng thái **giữ/khóa tài khoản**, chưa bấm xóa document.

## 6. Các file để hiểu và kiểm tra quy tắc

| File | Phụ trách |
| --- | --- |
| [user.model.ts](server/src/modules/auth/user.model.ts) | Trường role, isActive, authVersion, passwordHash và yêu cầu đổi mật khẩu |
| [auth.service.ts](server/src/modules/auth/auth.service.ts) | Đăng ký luôn CUSTOMER; mật khẩu được bcrypt trước khi lưu |
| [staff-admin.router.ts](server/src/modules/auth/staff-admin.router.ts) | Tạo STAFF; chặn sửa ADMIN và tự sửa quyền/trạng thái |
| [auth.middleware.ts](server/src/middlewares/auth.middleware.ts) | Kiểm tra tài khoản còn hoạt động, phiên bản token và phiên đăng nhập |
| [account.service.ts](server/src/modules/auth/account.service.ts) | Login, refresh, đổi mật khẩu, xác minh email và thu hồi phiên |
| [account.models.ts](server/src/modules/auth/account.models.ts) | Các collection loginsessions và accountchallenges |
| [audit.service.ts](server/src/modules/operations/audit.service.ts) | Nhật ký và tham chiếu người thực hiện |
| [HUONG-DAN-TU-VAN-HANH.md](HUONG-DAN-TU-VAN-HANH.md) | Chạy web, cấu hình, sao lưu và bản đồ file |

Không cần sửa `user.model.ts` hoặc bỏ kiểm tra trong middleware để tạo/xóa một tài khoản. File code định nghĩa quy tắc; document trong MongoDB mới là tài khoản cụ thể.
