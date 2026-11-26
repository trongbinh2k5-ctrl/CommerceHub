# Tổng kết kiểm tra BerylCore ngày 24 tháng 11 năm 2026

BerylCore là cửa hàng điện tử một người bán, dùng React và TypeScript ở frontend, Express và Mongoose ở backend, MongoDB làm cơ sở dữ liệu. Dự án đã có các luồng đủ để demo trong CV: tài khoản, danh mục, giỏ hàng, đặt đơn, thanh toán, vận chuyển, chat, quản trị và hoàn tiền thủ công. Bản hiện tại vẫn cần hoàn thiện vận hành trước khi dùng để bán hàng thật.

## Phạm vi kiểm tra cuối

- Đọc lại định tuyến, quyền truy cập, phiên đăng nhập, tạo/hủy đơn, SePay, GHN, hoàn tiền, thông báo và tìm kiếm.
- Chạy kiểm thử backend, frontend, trình duyệt, build hai phía, kiểm tra dependency và cấu hình.
- Kiểm thử ghi dữ liệu dùng MongoDB tạm. Phản hồi nhà cung cấp trong các ca tích hợp được giả lập; không gửi email, chuyển/hoàn tiền hoặc tạo chuyến giao hàng thật trong đợt này.
- Không thay cấu hình bí mật, tài khoản hay dữ liệu kinh doanh thật.

## Kết quả đã xác nhận

| Kiểm tra | Kết quả |
| --- | --- |
| Backend | 349/349 đạt; 0 fail, 0 skip |
| Frontend unit | 21/21 đạt |
| Trình duyệt Playwright | 49/49 đạt, gồm ca tìm kiếm trả ngược thứ tự và huy hiệu số đỏ; 0 fail, 0 skip |
| Build server | Đạt |
| Build client | Đạt; còn cảnh báo bundle lớn |
| npm audit server và client | Mỗi phía 0 cảnh báo ở thời điểm kiểm tra |
| Cấu hình | `config:check` đạt; SMTP, bắt buộc xác minh email, GHN test và SePay production đủ trường cấu hình |
| Mẫu bí mật trong nguồn/build | 194 file; không thấy mẫu thuộc 4 quy tắc private key, GitHub token, AWS access key và OpenAI project key |

Kết quả cấu hình chỉ kiểm tra trường dữ liệu, không xác minh dịch vụ đang hoạt động. Quét mẫu bí mật không đọc `.env`, không phải công cụ dò mọi loại khóa; `.env` hai phía được Git ignore, chỉ `.env.example` xuất hiện trong danh sách file env đã track ở lần kiểm tra này.

## Lỗi phát hiện và sửa trong lần cuối

| Mã | Lỗi | Cách sửa và bằng chứng |
| --- | --- | --- |
| FINAL-01 | Gợi ý tìm kiếm cũ trả về chậm ghi đè gợi ý của từ khóa mới | `client/src/App.tsx` vô hiệu hóa lượt effect cũ khi đổi từ khóa; không cho success/error/finally cũ cập nhật state. Xóa gợi ý trước khi chờ lượt mới. Ca Playwright chủ động đảo thứ tự phản hồi tái hiện lỗi trước sửa: nhập `new` nhưng thấy `Old suggestion`. Log: `qa/final-review-search-before.log`. |
| FINAL-02 | Nhãn ở bảng thanh toán vẫn gọi mọi giao dịch SePay là sandbox; trạng thái hoàn PROCESSING bị ghi chung là chờ hoàn | Đồng bộ nhãn tại `client/src/Admin.tsx`: dùng tên SePay và phân biệt đang xử lý hoàn tiền. Thông báo thiếu cấu hình trong `order.service.ts` cũng bỏ nhãn sandbox cố định. Không thay đổi giao dịch hoặc môi trường cấu hình. |

Huy hiệu đỏ được kiểm tra cùng luồng hoàn tiền: Đơn hàng có số chưa duyệt, Hoàn tiền có số chưa hoàn, Hội thoại rút gọn 105 thành 99+; hoàn tất yêu cầu làm số hoàn tiền biến mất khi về 0. Đây là kiểm tra hành vi mới, không tính thành lỗ hổng bảo mật.

## Thống kê bảo mật đúng phạm vi

| Nhóm | Số lượng | Trạng thái |
| --- | --- | --- |
| Điểm yếu ứng dụng đã tái hiện trong đợt 12/11 | 2 | Đã sửa, các kiểm thử hồi quy nằm trong bộ backend hiện tại |
| Cảnh báo dependency đã xử lý trong đợt 12/11 | 7 cảnh báo liên quan 4 thư viện | Lịch sử bản vá; audit hiện tại báo 0 |
| Nhóm lỗi chức năng/nội dung phát hiện lần cuối | 2 | Đã sửa như bảng FINAL-01 và FINAL-02 |

Hai điểm yếu ứng dụng lịch sử:

1. **Phiên được cấp từ lần kiểm tra mật khẩu đã cũ:** reset mật khẩu chen giữa xác minh mật khẩu và tạo phiên. Sửa bằng đối chiếu `authVersion` gắn với lần xác minh, kết hợp thu hồi phiên. Xem `server/tests/security-auth-race.test.ts`.
2. **Guard XLSX tin kích thước ZIP do file tự khai:** sửa bằng đối chiếu cấu trúc ZIP và giải nén có giới hạn trước ExcelJS. Xem `server/tests/security-xlsx.test.ts`.

Bảy advisory thư viện không có nghĩa đã có bảy đường khai thác thành công trên website. Chi tiết lịch sử, điều kiện khai thác và bản vá: [SECURITY-STUDY.md](SECURITY-STUDY.md). Không có kết luận rằng website không còn mọi lỗ hổng; đây là rà mã và kiểm thử dự án, chưa phải pentest độc lập môi trường triển khai.

## Những tình huống nghiệp vụ đã có kiểm thử bảo vệ

| Tình huống | Cách xử lý trong dự án | Nơi học và xem kiểm thử |
| --- | --- | --- |
| Khách sửa ID để xem dữ liệu người khác | Lọc theo chủ sở hữu ở backend; phân quyền CUSTOMER, STAFF, ADMIN | `authenticate`, các router/service; `customer-completeness.test.ts`, `chat.test.ts`, `shopping-completion.test.ts` |
| Mật khẩu đổi nhưng phiên cũ tiếp tục dùng | `authVersion`, session trong database, thu hồi khi reset/khóa/cấp lại quyền | `auth/account.service.ts`, `security-auth-race.test.ts`, `staff-management.test.ts` |
| Token reset dùng lại, hết hạn hoặc đặt đúng mật khẩu hiện tại | Token ngẫu nhiên lưu hash, kiểm tra hạn và tiêu thụ một lần trong transaction; bcrypt so sánh mật khẩu hiện tại | `auth/account.service.ts`, `customer-completeness.test.ts` |
| Tạo đơn chỉ thành công một nửa hoặc bán quá tồn | Tính tiền ở server, cập nhật tồn có điều kiện, transaction gồm các thay đổi liên quan | `orders/order.service.ts`, `module13.test.ts`, `system-core.test.ts` |
| Retry tạo hai đơn | Key theo khách + request hash, unique index và trả kết quả đã tạo | `checkout-idempotency.test.ts`, `checkout-idempotency.ts`, `order.model.ts` |
| Khách sửa giá, coupon hết lượt hoặc tổng cũ | Tính lại giá/khuyến mãi, kiểm tra dữ liệu hiện tại và tổng đã xác nhận | `quote.service.ts`, `coupons-errors.test.ts`, `catalog-cart-regressions.test.ts` |
| Browser tự khai thanh toán thành công | Không dùng return URL để đánh dấu PAID; xác thực IPN hoặc đọc API gateway, đối chiếu mã, số tiền và trạng thái | `payments/sepay.router.ts`, `sepay.service.ts`, `sepay.test.ts`, `sepay-production.test.ts` |
| Thanh toán/IPN lặp hoặc hủy gặp kết quả chưa rõ | Idempotency, trạng thái attempt; đối soát có xác thực trước khi mở khóa giao dịch | `sepay.test.ts`, `sepay-production.test.ts` |
| GHN timeout nhưng bên hãng đã tạo vận đơn | Giữ mã yêu cầu, trạng thái UNCERTAIN, tra cứu/đối soát; không tạo mã đơn mới tùy ý | `shipping/ghn.service.ts`, `ghn.test.ts`, `module14-shipping.test.ts` |
| Hủy sau bàn giao hoặc hoàn kho lặp | Quy tắc trạng thái đơn/vận đơn; GHN phải xác nhận hủy; cập nhật đơn, thanh toán và kho theo giao dịch | `order.service.ts`, `shipping-order-hooks.ts`, `ghn.test.ts` |
| Hoàn sai tiền, lộ ngân hàng hoặc khách sửa lúc admin chuyển | Chỉ ADMIN, kiểm tra đơn đã hủy và PAID, hoàn toàn bộ, mã giao dịch duy nhất, khóa tài khoản khi tiếp nhận; ngân hàng ẩn mặc định trong model | `refund.service.ts`, `refund-workflow.service.ts`, `shopping-completion.test.ts` |
| Retry chat, thông báo hoặc hoàn tiền tạo bản ghi trùng | Khóa/idempotency và dedupe theo từng luồng; thông báo và nhật ký được lưu cùng thay đổi nghiệp vụ ở các transaction liên quan | `chat.test.ts`, `shopping-completion.test.ts`, `operations.models.ts` |
| Upload file giả hoặc XLSX làm cạn tài nguyên | Quyền upload, giới hạn dữ liệu, chữ ký ảnh cơ bản, guard ZIP trước parser | `products/media.router.ts`, `excel/zip-guard.ts`, `security-xlsx.test.ts`, `excel.test.ts` |

Các dòng trên là tình huống được kiểm chứng, không phải thống kê số lỗi từng bị khai thác. Không cộng chúng với 2 điểm yếu bảo mật lịch sử.

## Phần còn hạn chế và thứ tự xử lý

| Ưu tiên | Phần còn thiếu hoặc giới hạn | Việc tiếp theo |
| --- | --- | --- |
| Trước bán thật | **Đơn chờ thanh toán chưa tự hết hạn**, tồn kho được trừ khi đặt đơn và giữ tới khi hủy | Định nghĩa hạn giữ hàng; worker đối soát gateway trước khi hủy, trả kho đúng một lần. Không dùng TTL xóa thẳng order/payment. |
| Trước đưa demo công khai | Chưa xác minh bản triển khai thật | HTTPS, domain, CORS/cookie, URL email, callback/return SePay; thử lại trên thiết bị khác. Link localhost không đại diện cho địa chỉ máy chạy web trên điện thoại. |
| Trước bán thật | GHN đang staging, chưa tự đồng bộ webhook, chưa đối soát COD/in nhãn cho vận hành thật | Chốt shop/địa chỉ, thông số đóng gói, khai giá và quy trình production; chạy đơn thử theo thỏa thuận với hãng. |
| Theo phạm vi sản phẩm | Hoàn tiền thủ công, toàn bộ cho đơn đã hủy | Admin chuyển qua ngân hàng rồi ghi nhận mã; chưa tự xác minh khách nhận tiền, chưa hoàn một phần và chưa nối hoàn tiền với quy trình đổi trả sau giao. |
| Trước bán thật | Giá, thông số SKU, ảnh, tồn và chính sách cần chủ cửa hàng xác nhận | Hoàn thiện trong quản trị; không trình bày dữ liệu demo/chưa cập nhật thành dữ liệu thương mại thật. |
| Trước bán thật | Chưa có bằng chứng kiểm thử tải, phục hồi backup và rà cấu hình cloud đầy đủ | Đặt mục tiêu tải, đo latency/lỗi, thử khôi phục dữ liệu, kiểm tra quyền Atlas, logging và cảnh báo. |
| Khi tăng tải | Chat/thông báo dùng polling; limiter và đồng bộ SePay chạy trong tiến trình hiện tại | Đo trước; cân nhắc SSE/WebSocket, rate-limit store dùng chung, worker/queue và khóa công việc khi chạy nhiều instance. Chưa thấy cấu hình CI trong phạm vi repo được rà. |
| Theo mục tiêu demo | Chatbot theo kịch bản; email SMTP đủ cấu hình nhưng đợt này không gửi thật; chưa có SMS | Trình bày đúng chatbot tra dữ liệu sản phẩm/FAQ, chưa gọi LLM. Xác minh tích hợp theo môi trường khi cần. |

Hai cảnh báo kỹ thuật không làm build/test thất bại:

- JavaScript khoảng **525.75 kB**, gzip **156.47 kB**, lớn hơn ngưỡng cảnh báo 500 kB của Vite. Có thể tách route quản trị và phần ít dùng bằng lazy import, sau đó đo lại.
- Mongoose cảnh báo một số lệnh còn dùng option `new`; nên chuyển dần sang `returnDocument: 'after'` và chạy hồi quy.

Doanh thu hiện trừ khoản hoàn theo ngày thu tiền gốc UTC. Đây là báo cáo doanh thu đã điều chỉnh, chưa phải sổ dòng tiền theo ngày chuyển hoàn. Dữ liệu ngân hàng nhận hoàn được ẩn khỏi API thông thường nhưng vẫn nằm trong database; cần giới hạn quyền database/backup khi vận hành thật.

## File chứng cứ và cách chạy lại

- [Backend cuối](qa/final-review-backend.log)
- [Audit dependency server](qa/final-review-server-deps.json), [client](qa/final-review-client-deps.json)
- [Quét mẫu bí mật](qa/final-review-source-patterns.json)
- [Bằng chứng tìm kiếm trước sửa](qa/final-review-search-before.log)
- [Bộ trình duyệt cuối](qa/final-review-browser.log)
- [Hướng dẫn hoàn tiền](REFUND-GUIDE.md)
- [Ôn phỏng vấn theo mã nguồn](INTERVIEW-GUIDE.md)

Trong `server`: `npm test`, `npm run build`, `npm audit --json`, `npm run config:check`.

Trong `client`: `npm test`, `npm run build`, `npx playwright test`, `npm audit --json`. Playwright khởi động backend demo/database tạm và preview riêng theo `playwright.config.ts`; không trỏ kiểm thử ghi dữ liệu vào database thật.
