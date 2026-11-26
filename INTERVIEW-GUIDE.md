# Ôn phỏng vấn dự án BerylCore

Mục tiêu là tự giải thích được quyết định thiết kế, đọc được đoạn mã tương ứng và xử lý được câu hỏi thay đổi yêu cầu. Ưu tiên hiểu luồng tiền, tồn kho và quyền truy cập trước khi học thêm tính năng. Bản kiểm tra hiện tại và giới hạn vận hành ở [FINAL-REVIEW-2026-11-24.md](FINAL-REVIEW-2026-11-24.md).

## Giới thiệu dự án trong khoảng một phút

“BerylCore là website bán thiết bị điện tử cho một cửa hàng. Frontend dùng React, TypeScript và TanStack Query; backend dùng Express, Mongoose và MongoDB. Em triển khai luồng tài khoản, danh mục, đặt đơn, thanh toán SePay, GHN staging, chat cửa hàng và hoàn tiền thủ công. Phần em tập trung là tính nhất quán dữ liệu: chống tạo đơn trùng khi retry, không bán quá tồn, xác thực kết quả thanh toán và giữ trạng thái khi nhà cung cấp chưa trả kết quả rõ ràng. Dự án có kiểm thử API, kiểm thử frontend và Playwright. Chatbot hiện theo kịch bản; hoàn tiền chưa tự chuyển qua API.”

Điều chỉnh “em triển khai” theo đúng phần bạn đã làm và hiểu. Nếu được hỏi về AI hỗ trợ lập trình, nói rõ cách dùng để tạo bản nháp/giải thích, cách tự đọc mã, tái hiện lỗi và xác minh bằng kiểm thử. Không nhận là tự huấn luyện mô hình AI hoặc tự viết toàn bộ mà không có hỗ trợ nếu không đúng.

## Các phần cần học theo thứ tự

| Mức ưu tiên | Chủ đề | Phải tự giải thích được | Đọc mã |
| --- | --- | --- | --- |
| 1 | JavaScript và TypeScript | Promise, async/await, closure, event loop, kiểu union, narrowing; TypeScript không kiểm tra JSON đầu vào lúc runtime | `client/src/api.ts`, `server/src/modules/payments/refund-workflow.service.ts` |
| 1 | HTTP và REST | Request/response, status 400/401/403/404/409/429/5xx, header, cookie, CORS; frontend guard khác backend authorization | `server/src/app.ts`, `middlewares/auth.middleware.ts`, `authorize.middleware.ts` |
| 1 | React và dữ liệu server | State, effect, cleanup, dependencies, controlled input; query key, invalidation, polling, loading/error/empty | `client/src/App.tsx`, `context.tsx`, `AdminWorkBadge.tsx`, `Account.tsx` |
| 1 | Thiết kế database | Quan hệ collections, embed/reference, snapshot đơn hàng, index unique/compound, atomic update | `orders/order.model.ts`, `payments/payment.model.ts`, `auth/account.models.ts` |
| 1 | Transaction và đồng thời | Giữ tính nhất quán đơn–kho–thanh toán; rollback; race condition; transaction không bao trùm API ngân hàng/GHN | `orders/order.service.ts`, `shipping/ghn.service.ts` |
| 1 | Xác thực và phân quyền | bcrypt, JWT, refresh cookie, hash token, expiry, session revocation, owner check và RBAC | `auth/account.service.ts`, `auth/token.service.ts`, `middlewares/auth.middleware.ts` |
| 1 | Thanh toán và hoàn tiền | Return URL khác IPN, đối soát, số tiền từ server, retry/idempotency, trạng thái tiền riêng trạng thái đơn | `payments/sepay.router.ts`, `sepay.service.ts`, `refund.service.ts` |
| 2 | Tích hợp bên ngoài | Timeout không đồng nghĩa thất bại; yêu cầu ổn định, trạng thái chưa rõ, xác minh trước khi retry/hủy | `shipping/ghn.service.ts`, `payments/sepay-sync.ts` |
| 2 | Bảo mật đầu vào | IDOR, XSS, CSRF, NoSQL injection, giới hạn dung lượng, ZIP bomb, secret và dependency | `security.middleware.ts`, `excel/zip-guard.ts`, [SECURITY-STUDY.md](SECURITY-STUDY.md) |
| 2 | Kiểm thử và debug | Unit/integration/E2E, mock nhà cung cấp, database tạm, test đồng thời, tái hiện trước sửa, regression | `server/tests`, `client/src/*.test.*`, `client/e2e`, `client/playwright.config.ts` |
| 3 | Triển khai và tối ưu | HTTPS, env, reverse proxy, callback, backup, CI; đo bundle/tải trước khi tối ưu | `server/src/index.ts`, `config/database.ts`, `start-commercehub.ps1` |

Các đường backend rút gọn trong bảng thuộc `server/src/modules`, trừ khi đã ghi đầy đủ đường dẫn.

## Sơ đồ tự vẽ trước buổi phỏng vấn

Vẽ từ React → HTTP API Express → middleware → router/controller/service → Mongoose → MongoDB. Từ service nối thêm SMTP, SePay và GHN. Giải thích đây là ứng dụng backend chia module chạy trong một tiến trình, chưa phải hệ thống microservice.

Vẽ các quan hệ User → Address/Cart/Order; Order → Payment/Shipment; Product → Category; Order giữ bản sao tên, SKU, giá và địa chỉ tại thời điểm mua. Chat có Conversation và Message; thông báo và nhật ký là các collection riêng.

Tự viết ba dòng trạng thái:

```text
Order:   PENDING → CONFIRMED → SHIPPING → DELIVERED
Payment: PENDING → PAID
Refund:  REQUESTED → PROCESSING → COMPLETED
```

Đây là đường đi chính; hủy/hoàn hàng là các nhánh có điều kiện. Không phải mọi trạng thái đều chuyển trực tiếp cho nhau. Hủy một order đã thanh toán không xóa lịch sử PAID; tạo luồng refund riêng.

## Câu hỏi thường gặp và ý cần trả lời

### 1. Vì sao chọn MongoDB thay vì SQL

Dữ liệu sản phẩm có nhóm thông số linh hoạt, order có thể embed snapshot items và địa chỉ. MongoDB phù hợp phạm vi hiện tại; các quan hệ và báo cáo vẫn cần index, kiểm tra tham chiếu và transaction. SQL cũng phù hợp thương mại điện tử, đặc biệt khi cần ràng buộc quan hệ và báo cáo phức tạp. Không trả lời rằng MongoDB luôn nhanh hoặc dễ mở rộng hơn SQL.

### 2. Tại sao lưu tên và giá vào order khi đã có productId

Product có thể đổi tên, giá hoặc bị ẩn sau khi mua. Snapshot giúp đơn cũ giữ thông tin lúc giao dịch. `productId` giữ liên kết; giá trong đơn phục vụ lịch sử, còn Mua lại dùng giá/tồn hiện tại.

### 3. Hai khách mua sản phẩm cuối cùng thì sao

Không chỉ đọc `stock` rồi trừ bằng một lệnh không có điều kiện. Lệnh cập nhật có điều kiện `stock >= quantity`, trừ bằng `$inc`, nằm trong transaction tạo đơn. Nếu có xung đột hoặc không đủ tồn, yêu cầu không được coi là thành công; các thay đổi liên quan phải rollback. Tự mở `order.service.ts` và chỉ đúng điều kiện cập nhật.

### 4. Bấm đặt hàng hai lần hay mất mạng rồi thử lại thì sao

Client giữ key cho một lần checkout. Server giới hạn key theo khách, lưu hash tham số, dùng unique index để chặn hai đơn cùng key. Retry cùng key/cùng tham số trả lại đơn cũ; key dùng lại với tham số xung đột trả 409. Không chỉ dựa vào disable nút vì client khác vẫn gọi API được.

Trong mã hiện tại, hash checkout gồm địa chỉ, coupon nếu có và phương thức thanh toán. Retry được tìm trước cả khi giỏ đã được xóa sau lần thành công. Key mới mới biểu thị một thao tác đặt hàng mới; không quảng cáo cơ chế này là chống mọi yêu cầu mua lặp với key khác.

### 5. Transaction bảo vệ được đến đâu

Nó giữ các thay đổi database trong phạm vi transaction cùng thành công hoặc rollback, tùy cấu hình database. Nó không tự rollback được tiền đã chuyển tại ngân hàng hoặc vận đơn đã tạo tại GHN. Với bên ngoài cần trạng thái trung gian, request ID ổn định, retry có kiểm soát và đối soát. MongoDB nhiều document cần môi trường hỗ trợ transaction, chẳng hạn replica set; bộ test dùng database tạm phù hợp.

Nguồn học: [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/).

### 6. Người dùng sửa role trong token hoặc frontend thì sao

JWT phải qua kiểm tra chữ ký và thuật toán; server còn đọc tài khoản hiện tại từ database, kiểm tra active, version và session. Quyền thực dùng từ user trong database. Ẩn nút ở frontend chỉ giúp trải nghiệm; API vẫn phải kiểm tra role và chủ sở hữu tài nguyên. Một CUSTOMER hợp lệ không được đọc order của CUSTOMER khác.

Nguồn học: [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### 7. Access token và refresh token khác nhau thế nào

Access token hiện có hạn 15 phút, giữ trong bộ nhớ frontend. Refresh là giá trị ngẫu nhiên trong cookie HttpOnly, lưu hash tại LoginSession, được xoay khi refresh. Session thường có hạn 30 ngày; trường hợp mật khẩu tạm bị ràng buộc hạn riêng. `authVersion` và session giúp thu hồi quyền sử dụng trước khi JWT tự hết hạn.

JWT được ký không có nghĩa được mã hóa; không đưa bí mật vào payload. HttpOnly giảm việc JavaScript đọc cookie, không ngăn toàn bộ hậu quả của XSS. Cookie có Secure ở production và SameSite=Lax; refresh/logout còn có kiểm tra origin. CORS không thay thế authentication.

### 8. Vì sao bcrypt cho mật khẩu nhưng SHA256 cho token reset

Mật khẩu do người chọn thường dễ đoán, cần thuật toán hash mật khẩu có chi phí. Token reset/session được sinh ngẫu nhiên đủ mạnh nên lưu digest SHA256 để so khớp mà không lưu giá trị gốc. Link reset có hạn, dùng một lần; reset thành công thu hồi phiên. TTL index dọn dữ liệu không thay cho kiểm tra `expiresAt` khi xử lý request.

### 9. Trang SePay trả về success có đủ xác nhận đã trả tiền không

Không. Trình duyệt và query string không phải nguồn xác nhận tiền. Backend xác thực IPN theo cấu hình của tích hợp hoặc gọi API gateway có xác thực, đối chiếu invoice, currency, amount, transaction và trạng thái. Với BerylCore, IPN SePay dùng kiểm tra `X-Secret-Key`; không nói nhầm thành HMAC của toàn bộ IPN body. Form checkout có cơ chế ký riêng theo adapter.

Tự đọc `sepay.config.ts`, `sepay.router.ts` và `markPaid` trong `sepay.service.ts` để giải thích chính xác cơ chế đang dùng.

### 10. Webhook gửi hai lần hoặc tiền đến lúc khách hủy thì sao

Callback có thể lặp; xử lý cùng dữ liệu không được tạo giao dịch/thông báo thêm. Dữ liệu trùng nhưng khác số tiền/mã phải bị chặn hoặc đưa sang đối soát. Khi hủy thanh toán, server đọc lại kết quả từ gateway rồi mới mở khóa trạng thái; timeout không cho phép tự kết luận tiền chưa đến.

### 11. Vì sao GHN có trạng thái UNCERTAIN

Web có thể timeout sau khi GHN đã tạo đơn. Nếu tạo mã yêu cầu mới ngay có thể sinh hai vận đơn. Giữ mã yêu cầu ổn định, lưu kết quả chưa rõ và tra cứu/đồng bộ; chỉ tiếp tục hủy khi hãng xác nhận điều kiện cho phép. Database transaction nội bộ không bao trùm GHN.

### 12. Hoàn tiền tại sao không đổi Payment về CANCELLED

PAID là lịch sử đã thu tiền. Refund là sự kiện sau đó nên lưu riêng số tiền, trạng thái, thời điểm và mã giao dịch. Hiện chỉ hoàn toàn bộ cho đơn đã hủy, ADMIN xác nhận sau khi chuyển ngoài web. Tài khoản nhận được khóa khi tiếp nhận; xác nhận lặp không trừ doanh thu hoặc gửi thông báo lần nữa. Chưa có xác minh độc lập tiền đã tới ngân hàng khách.

### 13. Khách không trả tiền thì tồn kho bị giữ bao lâu

Hiện chưa có worker tự hết hạn đơn; tồn giữ tới lúc đơn được hủy. Đây là giới hạn đã ghi nhận. Hướng nâng cấp: hạn giữ hàng, worker đối soát trạng thái gateway, chuyển đơn bằng điều kiện trạng thái và hoàn kho đúng một lần. Không xóa order bằng TTL vì sẽ mất lịch sử và không hoàn kho/đối soát được tiền đến muộn.

### 14. React Query giải quyết chuyện gì

Quản lý dữ liệu server, cache, refetch, loading/error và đồng bộ sau mutation. Query key phải chứa tham số lọc/phân trang và danh tính khi dữ liệu theo người dùng. Đổi dữ liệu phải invalidate các query liên quan; logout phải dọn cache riêng tư. Huy hiệu hoàn tiền chia sẻ cache của danh sách chưa hoàn, nên cập nhật cùng luồng xác nhận.

Polling là gửi request theo chu kỳ, chưa phải WebSocket. Chat hiện có chu kỳ truy vấn danh sách/tin nhắn; số thông báo thường làm mới mỗi 15 giây. Không khẳng định cập nhật tức thì giữa mọi thiết bị.

### 15. Debounce có tránh được gợi ý tìm kiếm sai không

Debounce chỉ giảm số lần gọi khi đang gõ. Request đã gửi vẫn có thể trả về ngược thứ tự. Lỗi FINAL-01 được sửa bằng cleanup vô hiệu hóa effect trước, chỉ cho lượt còn hiệu lực cập nhật state. Cleanup phải bảo vệ cả success, catch và finally, nếu không lượt cũ vẫn có thể tắt trạng thái loading của lượt mới. Có thể cân nhắc AbortController để hủy tài nguyên request nữa.

Nguồn học: [React useEffect và fetching data](https://react.dev/reference/react/useEffect#fetching-data-with-effects).

### 16. Em đã xử lý lỗi bảo mật nào có bằng chứng

Chọn hai ca cụ thể trong [SECURITY-STUDY.md](SECURITY-STUDY.md): xác minh mật khẩu cũ bị chen reset trước khi tạo phiên, và XLSX khai kích thước giải nén giả. Trình bày theo thứ tự điều kiện gây lỗi → hậu quả → ca test tái hiện → thay đổi mã → kiểm thử hồi quy. Không biến số advisory npm thành số lỗ hổng đã khai thác được.

### 17. Chatbot có phải AI tự huấn luyện không

Không. Hiện là provider theo kịch bản, nhận diện ý định/ngân sách/ngữ cảnh ngắn, FAQ và tra dữ liệu sản phẩm công khai. Interface `AssistantProvider` để thay adapter gọi mô hình sau này. Chưa có fine-tuning, model local hay LLM API. Không đưa quyền đặt đơn hoặc đọc bí mật tài khoản cho provider demo.

### 18. Kiểm thử bao nhiêu và chứng minh được điều gì

Đợt cuối: 349 backend, 21 frontend unit và 49 browser đều đạt. Backend dùng API và MongoDB tạm; nhiều ca nhà cung cấp dùng mock. Trình duyệt chạy luồng thật trên backend demo và mock một số tình huống biên. Số ca đạt không phải độ phủ phần trăm; chưa có số liệu coverage, tải production hay chứng nhận pentest trong báo cáo này.

Nguồn học: [Playwright](https://playwright.dev/docs/intro). Tự chạy một ca, đọc trace khi lỗi, giải thích assertion nào kiểm tra kết quả nghiệp vụ thay vì chỉ kiểm tra nút xuất hiện.

### 19. Vì sao máy tính mở link email được mà điện thoại không mở được

Localhost/127.0.0.1 trỏ về chính thiết bị đang mở link. Trên điện thoại nó không trỏ tới máy chạy backend/frontend. Phải có địa chỉ LAN hoặc domain/tunnel phù hợp, mở host/port và cấu hình origin, cookie, URL email/callback thống nhất. Chạy local rồi trở về domain khác có thể thiếu phiên vì cookie và bộ nhớ đăng nhập không tự chia sẻ giữa các origin.

### 20. Nếu số người dùng tăng thì nâng cấp gì trước

Đo độ trễ, request và truy vấn chậm trước. Các điểm hiện tại cần xem: bundle frontend hơn 500 kB, polling chat, truy vấn có populate/aggregate, phân trang và index, rate limiter dùng bộ nhớ tiến trình, background SePay sync trong app. Khi chạy nhiều instance cần quản lý worker/khóa công việc và store dùng chung. Chưa có benchmark để khẳng định chịu được một con số người dùng cụ thể.

### 21. Em sẽ làm gì tiếp theo

Với demo CV: chuẩn bị dữ liệu có ý nghĩa, sơ đồ dữ liệu, video/flow demo và môi trường công khai ổn định. Với bán thật: hết hạn đơn có đối soát, xác minh production/callback, GHN thực, chính sách hoàn tiền, backup/monitoring và kiểm thử tải. Phân biệt hai mục tiêu để không thêm tính năng tùy ý.

## Ba tình huống nên tự demo được

1. **Mua và hủy đơn:** xem sản phẩm → giỏ → địa chỉ → tạo đơn → giải thích phân biệt chờ thanh toán/chờ duyệt → hủy đúng điều kiện. Chỉ demo thanh toán qua môi trường/dữ liệu đã chuẩn bị, không chuyển tiền thật chỉ để trình diễn.
2. **Hoàn tiền thủ công:** khách gửi tài khoản → admin mở mục Hoàn tiền và tiếp nhận → thông tin bị khóa → giải thích chuyển khoản ngoài web → ghi nhận bằng dữ liệu demo → khách thấy tiến độ, mã và thông báo; số đỏ giảm.
3. **Kỹ thuật:** mở test hai request checkout hoặc test tìm kiếm trả ngược thứ tự; chỉ ra bản vá và kết quả. Có thể chọn thêm ca IDOR hoặc auth race nếu ứng tuyển backend.

## Kế hoạch ôn trong bảy buổi

| Buổi | Thực hành | Kết quả cần có |
| --- | --- | --- |
| 1 | Chạy hai app, vẽ kiến trúc và collections, đọc luồng HTTP | Tự giới thiệu dự án không nhìn tài liệu |
| 2 | Đăng nhập, refresh, reset, role/owner | Giải thích JWT không đủ để thay phân quyền và thu hồi phiên |
| 3 | Checkout, tồn kho, coupon, idempotency | Kể được trường hợp hai khách mua sản phẩm cuối |
| 4 | SePay, callback/đối soát, GHN timeout | Giải thích vì sao timeout không có nghĩa chưa thu tiền/chưa tạo vận đơn |
| 5 | React Query, effect cleanup, badge, polling | Tái hiện và giải thích lỗi gợi ý trả ngược thứ tự |
| 6 | Hai ca bảo mật, Excel/upload, test API và Playwright | Chạy lại một ca và đọc trace/log |
| 7 | Demo toàn luồng, đọc giới hạn, tự hỏi lại 21 câu | Demo gọn, chỉ đúng file, nói rõ phần chưa làm |

## Cách ghi CV

Ví dụ mô tả có thể kiểm chứng:

> BerylCore — website thương mại điện tử một cửa hàng. React, TypeScript, Express, MongoDB. Xây dựng checkout dùng transaction và idempotency; quản lý phiên và phân quyền; tích hợp luồng thanh toán SePay, GHN staging và hoàn tiền thủ công; chatbot theo kịch bản và chat cửa hàng. Kiểm thử API, unit và Playwright với database demo riêng.

Chỉ thêm con số test khi có thể mở log tương ứng. Không ghi “100% bảo mật”, “AI tự huấn luyện”, “microservices”, “WebSocket realtime”, “hoàn tiền tự động” hoặc số người dùng chịu tải khi các điều đó chưa được triển khai/đo. Khi chưa deploy, ghi rõ demo local thay vì nhận là hệ thống production.

## Tự kiểm tra trước khi gửi CV

Bạn đã sẵn sàng trình bày khi tự chỉ được file xử lý checkout, xác thực, payment callback và refund; giải thích được ít nhất một race condition; chạy lại được một ca test; nêu được ba giới hạn thật của dự án. Nếu chưa làm được, tập trung đọc và sửa một tình huống nhỏ có kiểm thử thay vì học thuộc câu trả lời.
