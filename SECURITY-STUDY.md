# Sổ tay các phát hiện bảo mật và cách sửa — BerylCore

Cập nhật: **12/11/2026**. Tài liệu dành cho việc đọc mã, ôn kiến thức và trình bày dự án trong CV/phỏng vấn.

Lịch sử phát hiện trong tài liệu này thuộc đợt 12/11. Kết quả kiểm tra hiện tại: [tổng kết 24/11/2026](FINAL-REVIEW-2026-11-24.md). Câu hỏi ôn theo toàn bộ dự án: [INTERVIEW-GUIDE.md](INTERVIEW-GUIDE.md).

## 1. Hiểu đúng số lượng phát hiện

Đã xác nhận và sửa **2 điểm yếu trong mã ứng dụng** bằng kiểm thử tái hiện. Đồng thời đã cập nhật **4 thư viện liên quan đến 7 cảnh báo bảo mật**. Cảnh báo thư viện không đồng nghĩa đường khai thác đó đã hoạt động trên website; chưa tái hiện khai thác các cảnh báo này qua nghiệp vụ của ứng dụng.

Không có bằng chứng từ đợt kiểm tra cho thấy dữ liệu thật từng bị khai thác. Báo cáo kỹ thuật và phạm vi kiểm tra: [SECURITY-REVIEW-2026-11-12.md](SECURITY-REVIEW-2026-11-12.md).

## 2. Hai điểm yếu của ứng dụng đã xác nhận

### SEC-01 — Tạo phiên từ lần kiểm tra mật khẩu đã cũ

**Vấn đề trước sửa:** đăng nhập kiểm tra mật khẩu rồi đọc lại tài khoản để tạo phiên. Nếu mật khẩu được reset giữa hai bước, lần đọc sau có thể lấy `authVersion` mới và cấp một phiên hợp lệ dựa trên mật khẩu cũ.

**Điều kiện:** phải biết mật khẩu cũ và gặp đúng thời điểm có thao tác đổi/reset mật khẩu đồng thời. Đây không phải khả năng đăng nhập tùy ý mà không biết mật khẩu.

**Cách sửa:** giữ `authVersion` tại thời điểm server kiểm tra mật khẩu, chuyển nội bộ sang bước tạo phiên và so sánh với version hiện tại trong database. Nếu khác thì trả 401, yêu cầu đăng nhập lại. Version không lấy từ dữ liệu client gửi lên. Nếu reset xảy ra sau bước kiểm tra version, token version cũ sẽ bị cơ chế xác thực hiện có từ chối.

| Đọc ở đâu | Nội dung cần xem |
|---|---|
| [auth.service.ts](server/src/modules/auth/auth.service.ts) | `loginUser` trả thêm version nội bộ gắn với lần kiểm tra mật khẩu |
| [auth.controller.ts](server/src/modules/auth/auth.controller.ts) | Truyền version đó vào `startLoginSession` |
| [account.service.ts](server/src/modules/auth/account.service.ts) | So sánh version trước khi cấp phiên |
| [security-auth-race.test.ts](server/tests/security-auth-race.test.ts) | Chèn thao tác đổi mật khẩu chính xác giữa hai bước, không dựa vào sleep |

**Bằng chứng:** trước sửa trả 200 thay vì 401. Sau sửa trả 401, không cấp cookie, không tạo session; mật khẩu mới vẫn đăng nhập được và mật khẩu cũ bị từ chối.

**Từ khóa nghiên cứu:** race condition, TOCTOU, optimistic version check, session revocation, deterministic concurrency test.

### SEC-02 — Kiểm tra Excel tin kích thước ZIP do file tự khai báo

**Vấn đề trước sửa:** XLSX thực chất là ZIP. Guard cũ cộng kích thước giải nén trong central directory để kiểm tra giới hạn 30 MB. Người tạo file có thể khai báo kích thước nhỏ hơn dữ liệu thật, khiến lớp kiểm tra cho file đi tiếp tới ExcelJS, tạo nguy cơ tiêu tốn RAM/CPU ngoài dự kiến.

**Điều kiện:** cần tài khoản STAFF/ADMIN có quyền nhập Excel. Khách hàng và người chưa đăng nhập không được gọi chức năng này.

**Cách sửa:** xác minh cấu trúc ZIP trước khi đưa vào ExcelJS và kiểm chứng dữ liệu giải nén thực tế với giới hạn đầu ra:

- File tải lên tối đa 5 MB, tổng giải nén tối đa 30 MB, tối đa 200 entries.
- Đối chiếu central directory và local header; kiểm tra tên, phương thức nén và kích thước tương ứng.
- Từ chối entry trùng/chồng lấn, file mã hóa, ZIP64/multi-disk và phương thức nén ngoài STORE/DEFLATE.
- Dùng `inflateRawSync` với `maxOutputLength` hữu hạn; kích thước giải nén thực phải khớp kích thước đã kiểm tra.

| Đọc ở đâu | Nội dung cần xem |
|---|---|
| [zip-guard.ts](server/src/modules/excel/zip-guard.ts) | Kiểm tra cấu trúc và giải nén có giới hạn |
| [workbook.ts](server/src/modules/excel/workbook.ts) | Gọi guard trước khi ExcelJS đọc workbook |
| [security-xlsx.test.ts](server/tests/security-xlsx.test.ts) | Mẫu nhỏ có dữ liệu thực 128 KB nhưng khai 0 byte |

**Bằng chứng:** trước sửa mẫu sai kích thước vẫn tới parser; sau sửa bị chặn trước khi gọi ExcelJS. Không tạo file khổng lồ hoặc làm cạn RAM để thử nghiệm, nên tác động DoS quy mô lớn là đánh giá rủi ro từ đường xử lý.

**Từ khóa nghiên cứu:** ZIP bomb, resource exhaustion, untrusted metadata, bounded decompression, input validation.

## 3. Bảy cảnh báo thư viện đã xử lý

Mức độ dưới đây là mức công bố của advisory, không phải điểm CVSS tự chấm cho website.

| Thư viện / cảnh báo | Mức công bố | Nguy cơ và điều kiện liên quan | Cách xử lý trong dự án |
|---|---|---|---|
| body-parser — [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) | Cao | DoS với byte dư sau request body nén; dải ảnh hưởng 2.x từ 2.0.0 đến trước 2.4.0 | Cập nhật dependency gián tiếp lên **2.4.0** |
| qs — [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) | Trung bình | `stringify` với `arrayFormat: 'comma'` có thể ném TypeError khi phần tử có thuộc tính `toString` không gọi được; không phải cảnh báo NoSQL injection | Cập nhật lên **6.17.1**; dải bị cảnh báo 6.7.0–6.16.0 |
| uuid — [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Trung bình | Thiếu kiểm tra biên buffer ở v3/v5/v6 khi truyền `buf`; bản cũ đang cài là 8.3.2 | Override dependency của ExcelJS sang **11.1.1** |
| Mongoose — [GHSA-gg4r-jv3p-qx3c](https://github.com/advisories/GHSA-gg4r-jv3p-qx3c) | Cao | `sanitizeFilter` đặt ở cấp connection có thể không được áp dụng như dự kiến | Nâng **9.11.1 → 9.11.4** |
| Mongoose — [GHSA-wr5m-5jph-8m96](https://github.com/advisories/GHSA-wr5m-5jph-8m96) | Trung bình | Discriminator key trùng tên thuộc tính kế thừa có thể vượt qua schema casting | Nâng **9.11.1 → 9.11.4** |
| Mongoose — [GHSA-8332-j7wj-wjw4](https://github.com/advisories/GHSA-8332-j7wj-wjw4) | Cao | Đi vào thuộc tính kế thừa khi hydrate/set/merge, có thể ảnh hưởng built-in/schema dùng chung và gây DoS | Nâng **9.11.1 → 9.11.4** |
| Mongoose — [GHSA-6972-9mcm-vhwj](https://github.com/advisories/GHSA-6972-9mcm-vhwj) | Trung bình | Prototype pollution qua `Schema.prototype.virtual()` | Nâng **9.11.1 → 9.11.4** |

Bốn cảnh báo Mongoose trên ảnh hưởng nhánh 9.0.0–9.11.3; đối chiếu [release 9.11.4](https://github.com/Automattic/mongoose/releases/tag/9.11.4).

**Lưu ý về khả năng khai thác:** chưa có ca kiểm thử chứng minh các advisory thư viện khai thác được qua API nghiệp vụ hiện tại. Riêng ExcelJS đã rà chỉ thấy dùng UUID v4, còn advisory UUID nói về v3/v5/v6. Cảnh báo npm gắn với ExcelJS là do dependency UUID, không phải một lỗ hổng độc lập thứ tám.

### Cập nhật ở file nào và tại sao chọn cách đó?

- [server/package.json](server/package.json): Mongoose dùng `~9.11.4`; override riêng `exceljs.uuid` thành `11.1.1`.
- [server/package-lock.json](server/package-lock.json): lưu chính xác các bản đã giải quyết, gồm body-parser và qs.
- Dùng `npm audit fix` để lấy cập nhật tương thích cho body-parser/qs, không dùng `--force`.
- Giữ ExcelJS 4.4.0 và thay UUID qua override thay vì chấp nhận đề xuất hạ ExcelJS xuống 3.4.0. Override cần được kiểm thử tương thích vì thay dependency qua ranh giới major.
- Chạy lại kiểm thử backend, frontend, Excel và toàn bộ E2E sau thay đổi thư viện.

**Từ khóa nghiên cứu:** software composition analysis (SCA), transitive dependency, lockfile, semver, dependency override, reachability analysis, prototype pollution.

## 4. Những cải thiện và lớp bảo vệ khác cần phân biệt

| Nội dung | Cách đang xử lý | Phân loại |
|---|---|---|
| Reset về đúng mật khẩu hiện tại | So sánh bằng bcrypt, trả 400 nếu trùng; transaction giữ link còn dùng được khi bị từ chối để người dùng nhập mật khẩu khác | Cải thiện chính sách; chỉ chặn mật khẩu hiện tại, chưa phải lịch sử nhiều mật khẩu |
| Thử mật khẩu liên tục khi đổi email | Đã có limiter 5 lần/15 phút; thêm kiểm thử lần thứ sáu trả 429 và `Retry-After` | Lớp bảo vệ có sẵn được kiểm chứng, không phải lỗi mới phát hiện |
| Đọc/sửa dữ liệu của tài khoản khác (IDOR) | Kiểm tra owner và quyền ở backend cho đơn hàng, địa chỉ, phiên, hội thoại và các tài nguyên liên quan | Đã rà và có kiểm thử; chưa xác nhận thêm lỗi trong phạm vi này |
| Giả quyền từ frontend | Backend lấy quyền/trạng thái tài khoản từ database, kiểm tra quyền từng API; API nhân viên không tự tạo ADMIN | Cơ chế phân quyền hiện có |
| Cookie/CSRF | Refresh cookie HttpOnly, SameSite=Lax, Secure ở production; kiểm tra origin trên refresh/logout | Cơ chế bảo vệ hiện có; CORS đơn lẻ không thay thế xác thực/CSRF |
| Token quên mật khẩu | Lưu hash, hết hạn, dùng một lần, thu hồi phiên khi reset thành công | Cơ chế bảo vệ hiện có |
| Upload ảnh | STAFF/ADMIN, giới hạn dung lượng, kiểm tra chữ ký cơ bản PNG/JPEG/WebP, tên UUID, không nhận SVG, header bảo vệ khi phục vụ file | Phòng vệ hiện có; kiểm tra chữ ký cơ bản không phải quét mã độc đầy đủ |
| Bí mật cấu hình | `.env` được ignore, không đưa khóa vào frontend; quét các mẫu khóa đặc hiệu trong nguồn/build đã kiểm tra | Quét không phát hiện không chứng minh mọi bí mật đều an toàn |

File reset mật khẩu: [account.service.ts](server/src/modules/auth/account.service.ts). Kiểm thử liên quan: [customer-completeness.test.ts](server/tests/customer-completeness.test.ts), [staff-management.test.ts](server/tests/staff-management.test.ts).

Hiển thị tên Admin trong chat, thông báo phân công thành công và link localhost không mở được trên điện thoại là vấn đề giao diện/cấu hình kết nối; không tính vào danh sách lỗ hổng bảo mật.

## 5. Bằng chứng kiểm thử đã lưu

Kết quả đợt rà soát 12/11/2026, không phải một lần chạy mới khi viết tài liệu này:

- Backend: **283/283** ca đạt; frontend: **21/21** ca đạt.
- Playwright: **40/40** ca đạt, không skip, không flaky.
- Build backend và frontend thành công; npm audit ghi nhận **0 cảnh báo** ở cả hai.
- Quét heuristic 164 file không thấy mẫu khóa đặc hiệu thuộc bộ quy tắc đã dùng.

Chứng cứ ở [qa/security-review-2026-11-12](qa/security-review-2026-11-12): `backend-tests.log`, `e2e-results.json`, `backend-audit.json`, `frontend-audit.json`, `source-scan.json`.

Hai kiểm thử tái hiện dùng database tạm và dữ liệu giả, không sửa tài khoản thật hoặc gửi email thật.

## 6. Cách tự nghiên cứu lại

Đọc hai ca kiểm thử trước để thấy hành vi cần bảo đảm, sau đó đọc service/guard tương ứng. Từ thư mục `D:\CommerceHub\server`, có thể chạy:

```powershell
node --import tsx --test tests/security-auth-race.test.ts tests/security-xlsx.test.ts
npm test
npm run build
npm audit --json
npm ls mongoose body-parser qs uuid --depth=2
```

Khi học dependency: đọc advisory để xác định **phiên bản + hàm + điều kiện đầu vào**, tìm nơi gọi trong mã, chọn bản vá tương thích rồi chạy regression tests. Không đánh đồng số cảnh báo npm với số đường khai thác đã xác nhận.

Thứ tự học đề xuất: xác thực và phiên → race condition/TOCTOU → kiểm tra dữ liệu và giới hạn tài nguyên → dependency/lockfile → phân quyền/IDOR → XSS/CSRF.

## 7. Giới hạn của kết luận

Đây là rà mã và kiểm thử trong phạm vi dự án, không phải chứng nhận pentest độc lập. Chưa xác minh đầy đủ cấu hình Atlas/cloud, quyền người dùng database thực tế, TLS/reverse proxy và hành vi dưới tải lớn của môi trường triển khai. `npm audit = 0` cũng không phát hiện được toàn bộ lỗi logic nghiệp vụ hoặc lỗi chưa được công bố.

Khi đưa web lên mạng cần rà lại cấu hình môi trường triển khai và các tích hợp mới. Không suy diễn rằng mọi lỗ hổng đã được loại bỏ chỉ từ kết quả hiện tại.
