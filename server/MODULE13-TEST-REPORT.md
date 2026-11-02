# Báo cáo kiểm thử Module 13

Ngày kiểm thử: 29/10/2026. Kết quả: **20/20 mục đạt**.

## Lỗi phát hiện và thay đổi

- `src/modules/orders/order.controller.ts` chứa hai phiên bản controller nối tiếp nhau, gây trùng import và khai báo. Bản cũ gọi `createOrder` thiếu checkout key và luôn trả 201. Đã bỏ bản cũ, giữ bản kiểm tra header `Idempotency-Key`, truyền key vào service và trả 200 khi replay, 201 khi tạo mới.
- `src/modules/payments/payment.service.ts` chứa hai phiên bản service nối tiếp nhau, gây trùng khai báo và sai số tham số so với controller. Đã bỏ bản cũ, giữ bản nhận người xác nhận, lưu `confirmedBy` cùng `paidAt` và kiểm tra chủ sở hữu Payment khớp Order.
- Thêm `tests/module13.test.ts` và dev dependency `mongodb-memory-server` để kiểm thử HTTP với MongoDB replica set thực, không mock transaction.
- Các cơ chế transaction, trừ kho có điều kiện, khóa duy nhất, kiểm tra số tiền, hủy đơn và migration đã có trong code; không ghi nhận đây là các sửa đổi mới.

## Checklist và kết quả

| Mục | Tình huống | Kết quả quan sát |
| --- | --- | --- |
| 1 | Tạo Order + Payment | Đạt: 201, đúng một Order và Payment, trừ đúng kho. |
| 2 | Replay cùng khóa và dữ liệu | Đạt: 200, cùng orderId, kho không giảm thêm. |
| 3 | Cùng khóa, đổi addressId | Đạt: 409, số Order không tăng. |
| 4 | Thiếu hoặc sai khóa | Đạt: 400 cho khóa thiếu, ngắn, chứa khoảng trắng hoặc quá dài; không ghi Order/Payment. |
| 5 | Đồng thời cùng khóa | Đạt: đúng một Order commit, kho chỉ trừ một lần, retry trả 200. |
| 6 | Đồng thời khác khóa | Đạt: cùng giỏ chỉ một checkout thành công; hai khách tranh sản phẩm tồn 2 cũng chỉ một đơn thành công, kho về 0. |
| 7 | Không đủ kho | Đạt: 409; không ghi Order/Payment; sản phẩm đã trừ trước trong transaction được rollback. |
| 8 | CUSTOMER xem Payment của mình | Đạt: 200, đúng orderId và số tiền. |
| 9 | CUSTOMER xem Payment người khác | Đạt: 404, response không chứa data thanh toán. |
| 10 | CUSTOMER gọi admin API | Đạt: 403 ở danh sách đơn, danh sách/chi tiết Payment và xác nhận COD. |
| 11 | COD trước DELIVERED | Đạt: 409, Payment vẫn PENDING. |
| 12 | COD sau DELIVERED | Đạt: 200, PAID, có paidAt và confirmedBy đúng nhân viên. Đã đi qua CONFIRMED → SHIPPING → DELIVERED bằng API. |
| 13 | Xác nhận lần hai | Đạt: 409, toàn bộ Payment giữ nguyên, gồm người và thời điểm xác nhận đầu. |
| 14 | Hai nhân viên xác nhận đồng thời | Đạt: một 200 và một 409; confirmedBy thuộc request thắng. |
| 15 | Hủy chưa thanh toán | Đạt: hai request hủy đồng thời cho một 200 và một 409; Order/Payment cùng CANCELLED, hoàn đúng kho một lần. |
| 16 | Hủy đã thanh toán | Đạt: 409, không hoàn kho, Payment giữ nguyên. |
| 17 | Payment lệch số tiền | Đạt: 409, không chuyển PAID; kiểm tra bổ sung lệch chủ sở hữu cũng bị từ chối. |
| 18 | Migration thử, thật và lặp lại | Đạt: chạy script CLI dry-run không tăng Payment; apply tạo đúng một Payment thiếu; apply lần hai không tăng số lượng và không đổi bản ghi đã tạo. |
| 19 | Migration đơn DELIVERED cũ | Đạt: Payment mới PENDING, paidAt và confirmedBy null, không tự đánh dấu PAID. Script có cảnh báo đối soát cho đơn DELIVERED được bổ sung Payment. |
| 20 | Typecheck, build và tests | Đạt: npm run typecheck; npm run build; npm test, 27 test đạt, 0 lỗi, 0 bỏ qua. |

## Phạm vi và cách chạy lại

Chạy trong thư mục `server`: `npm run typecheck`, `npm run build`, `npm test`.

`npm test` tạo MongoDB replica set tạm và HTTP server trên cổng ngẫu nhiên, gọi API thật qua middleware xác thực/phân quyền, đối chiếu dữ liệu đã commit và chạy migration bằng tiến trình CLI riêng. Database test được dừng sau kiểm thử; không dùng URI database ứng dụng trong `.env`. Lần đầu có thể cần tải MongoDB binary. Trên môi trường sandbox Windows, test cần quyền tạo tiến trình; lần chạy đầu bị `spawn EPERM`, sau khi được cấp quyền đã chạy thành công.

Đây là kết quả trên môi trường test cục bộ, chưa phải xác minh dữ liệu hoặc cấu hình triển khai thực tế. Mongoose có cảnh báo tùy chọn `new` đã deprecated; cảnh báo không làm thất bại kiểm thử.
