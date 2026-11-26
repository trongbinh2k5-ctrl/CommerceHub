# Rà soát bảo mật BerylCore — 12/11/2026

## Kết luận trong phạm vi kiểm tra

Rà mã nguồn và thêm kiểm thử chuyên biệt đã xác nhận **hai điểm yếu trong mã ứng dụng**, dù npm không còn báo lỗ hổng thư viện. Cả hai đã được sửa và hai ca tái hiện chuyển từ thất bại sang đạt. Chưa xác nhận được thêm lỗi truy cập chéo tài khoản, nâng quyền hoặc chèn mã chạy được trong các luồng đã rà; điều này không phải chứng nhận ứng dụng không còn mọi lỗ hổng.

Không thực hiện khai thác trên database thật, không gửi email thật và không thay đổi tài khoản/mật khẩu người dùng. Các ca ghi dữ liệu dùng MongoDB tạm; mẫu ZIP kiểm thử chỉ giải nén thành 128 KB, không tạo tải làm cạn RAM.

## Hai phát hiện đã xử lý

### SEC-01 — Phiên đăng nhập có thể được tạo từ bằng chứng mật khẩu đã cũ

**Điều kiện:** có một yêu cầu đăng nhập đã kiểm tra đúng mật khẩu cũ; mật khẩu được đổi/reset trong khoảng giữa bước kiểm tra đó và bước đọc lại tài khoản để tạo phiên.

Trước sửa, `loginUser` trả ID rồi `startLoginSession` đọc lại tài khoản. Nếu lần đọc sau thấy `authVersion` mới, phiên vẫn có thể được tạo bằng version mới mặc dù mật khẩu đã được kiểm tra là mật khẩu cũ. Người khai thác phải biết mật khẩu cũ và khớp cửa sổ thực thi đồng thời; không phải đăng nhập tùy ý không cần mật khẩu.

**Bằng chứng:** kiểm thử chèn chính xác thao tác đổi mật khẩu giữa hai lần đọc, không dựa vào sleep. Trước sửa API trả **200** thay vì 401. Sau sửa trả **401**, không cấp cookie, không tạo session mới; đăng nhập bằng mật khẩu mới vẫn thành công.

**Bản vá:** giữ `authVersion` của lần kiểm tra mật khẩu trên server và so sánh trước khi tạo phiên. Nếu thông tin đã đổi thì yêu cầu đăng nhập lại. Không nhận version từ body của client và không trả hash mật khẩu ra API.

File liên quan:

- [auth.service.ts](server/src/modules/auth/auth.service.ts): trả version nội bộ của bằng chứng đăng nhập.
- [auth.controller.ts](server/src/modules/auth/auth.controller.ts): chuyển version sang bước tạo phiên.
- [account.service.ts](server/src/modules/auth/account.service.ts): kiểm tra version trước cấp session.
- [security-auth-race.test.ts](server/tests/security-auth-race.test.ts): tái hiện xác định, kiểm tra phiên bị từ chối và mật khẩu mới còn dùng được.

### SEC-02 — Kiểm tra ZIP Excel chỉ tin kích thước do file khai báo

**Điều kiện:** tài khoản có quyền STAFF/ADMIN gửi file XLSX được tạo đặc biệt vào chức năng nhập Excel. Người chưa đăng nhập hoặc khách hàng không có quyền gọi chức năng này.

Lớp guard cũ cộng kích thước giải nén từ ZIP central directory trước khi chuyển file cho ExcelJS. Kích thước do file cung cấp có thể bị khai sai; vì vậy ngân sách giải nén 30 MB chưa được bảo đảm bằng dữ liệu thật. File nén nhỏ có thể khiến bộ phân tích tiếp tục giải nén nhiều hơn dự kiến, gây rủi ro tiêu thụ RAM/CPU.

**Bằng chứng:** mẫu nén nhỏ có dữ liệu thực 128 KB nhưng cả hai header khai 0 byte. Trước sửa vẫn đi tới bộ phân tích workbook. Sau sửa bị từ chối **trước khi gọi ExcelJS**. Không thử làm process hết bộ nhớ; tác động DoS lớn là đánh giá từ đường xử lý, không phải kết quả làm sập hệ thống thật.

**Bản vá:** kiểm tra đầy đủ thư mục ZIP, đối chiếu local header, kích thước, tên và phương thức nén; từ chối file mã hóa, ZIP64/multi-disk, entry trùng/chồng lấn và cấu trúc sai. Mỗi luồng DEFLATE được giải nén kiểm chứng với `maxOutputLength` hữu hạn trước ExcelJS. Tổng giải nén giới hạn 30 MB, file vào tối đa 5 MB, tối đa 200 entries.

File liên quan:

- [zip-guard.ts](server/src/modules/excel/zip-guard.ts): bộ kiểm tra cấu trúc và giải nén giới hạn.
- [workbook.ts](server/src/modules/excel/workbook.ts): gọi guard trước `book.xlsx.load`.
- [security-xlsx.test.ts](server/tests/security-xlsx.test.ts): kiểm tra file khai sai kích thước bị chặn trước parser.

Các mức ảnh hưởng nêu trên là phân tích của đợt rà soát, không phải CVE/CVSS được công bố cho dự án.

## Những nhóm đã rà

| Nhóm | Cơ chế và kiểm chứng |
|---|---|
| Đăng nhập/JWT | HS256, thời hạn token, trạng thái tài khoản/quyền từ database, authVersion và sessionId; thêm ca race SEC-01 |
| Cookie/CSRF | Refresh cookie HttpOnly, SameSite=Lax, Secure ở production; kiểm tra origin cho refresh/logout và thử origin ngoài danh sách |
| Khôi phục/đổi mật khẩu | Token ngẫu nhiên chỉ lưu hash, thời hạn, dùng một lần, từ chối mật khẩu trùng, thu hồi phiên; không làm lộ token trong phản hồi thông thường |
| Đổi email | Cần mật khẩu hiện tại, email chỉ đổi sau xác nhận; đã có giới hạn thử 5 lần/15 phút, bổ sung kiểm thử xác nhận 429/Retry-After |
| Phân quyền/IDOR | Kiểm tra CUSTOMER/STAFF/ADMIN, ownerId cho đơn/địa chỉ/phiên/hội thoại; thay ID tài khoản khác bị từ chối trong kiểm thử |
| Mongo/query/mass assignment | Kiểm tra kiểu, allowlist trường, escape regex; quyền không lấy từ body của khách |
| Upload ảnh | Xác thực/quyền trước nhận body, giới hạn 5 MB, kiểm tra chữ ký, tên UUID, không nhận SVG, nosniff/CSP cho file |
| Excel | Quyền và owner phiên nhập, giới hạn file/dòng, không nhận công thức/đối tượng, bí mật nhân viên chỉ cấp lần đầu; thêm SEC-02 |
| Chat | Không đọc hội thoại người khác, phân công/tiếp nhận độc quyền, bot chỉ tra dữ liệu công khai, nội dung hiển thị dạng text |
| Frontend | Token truy cập trong bộ nhớ; không thấy dùng innerHTML/eval cho dữ liệu người dùng trong các luồng đã rà; React render text |
| Cấu hình và bí mật | `.env` không được Git theo dõi và bị ignore; quét mẫu khóa riêng trong nguồn/request/bundle và tên biến VITE nhạy cảm |
| Thư viện | Audit trực tiếp npm cho cả backend/frontend, không dùng kết quả cache để kết luận |

## Kết quả kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| Backend đầy đủ sau bản vá | 283/283 đạt, không bỏ qua; gồm ba ca bảo mật mới |
| Hai ca tái hiện SEC-01/SEC-02 | Thất bại trước sửa, đạt sau sửa |
| Kiểm tra giới hạn đổi email | Đạt; cơ chế đã có sẵn, không tính là lỗ hổng mới |
| Frontend unit test | 21/21 đạt |
| Trình duyệt đầy đủ sau bản vá | 40/40 đạt; không bỏ qua, không flaky |
| Build backend/frontend | Đạt |
| npm audit backend/frontend | 0 lỗ hổng được báo cáo ở thời điểm kiểm tra |
| Quét mẫu khóa riêng | 164 tệp, không có mẫu trùng; không có tên biến VITE nhạy cảm trong cấu hình frontend được kiểm tra |

Quét mẫu khóa là heuristic, không chứng minh mọi bí mật đều được phát hiện. Không in giá trị `.env` hoặc khóa/mật khẩu vào báo cáo.

Bằng chứng: [log backend](qa/security-review-2026-11-12/backend-tests.log), [kết quả trình duyệt](qa/security-review-2026-11-12/e2e-results.json), [audit backend](qa/security-review-2026-11-12/backend-audit.json), [audit frontend](qa/security-review-2026-11-12/frontend-audit.json), [quét nguồn](qa/security-review-2026-11-12/source-scan.json).

## Phạm vi chưa xác minh và vận hành

- Chưa kiểm tra hạ tầng Atlas: IP allowlist, tài khoản database, quyền cloud và khả năng khôi phục bản sao lưu. Không truy cập hay thay cấu hình Atlas trong lần rà này.
- Chưa kiểm tra máy chủ công khai, HTTPS/reverse proxy hoặc tải tấn công lớn. Website đang được phát triển local; localhost không dùng trực tiếp cho thiết bị khác.
- Rate limit hiện theo IP và bộ nhớ của từng tiến trình. Khi triển khai nhiều instance cần store/gateway dùng chung; không coi cơ chế hiện tại là bảo vệ DDoS hoàn chỉnh.
- VNPAY/GHN/SMS/API AI chưa tích hợp nên chưa có các callback/webhook đó để kiểm tra.
- Không có bằng chứng trong đợt kiểm tra này cho thấy dữ liệu thật đã bị khai thác. Kiểm thử có kiểm soát không thay thế theo dõi log thực tế khi vận hành.

Nếu backend đang chạy bản build cũ, build và khởi động lại để nạp mã đã sửa. Không cần thay JWT, reset hàng loạt mật khẩu, xóa tài khoản hoặc sửa dữ liệu để áp dụng các bản vá này.
