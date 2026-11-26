# Hoàn tiền thủ công

## Khách hàng

1. Mở **Tài khoản → Đơn hàng → Chi tiết** của đơn đã hủy và đã thanh toán.
2. Nhập ngân hàng, số tài khoản và tên chủ tài khoản trong **Nhập tài khoản nhận tiền**, bấm **Gửi thông tin nhận tiền**.
3. Có thể sửa tài khoản trước khi cửa hàng tiếp nhận. Sau khi tiếp nhận, thông tin được khóa.
4. Chi tiết đơn hiển thị số tiền hoàn, thời điểm ghi nhận, tiếp nhận và hoàn tất. Khi hoàn tất có mã giao dịch và thông báo trong web. Nếu cần trao đổi, bấm **Liên hệ về khoản hoàn**.

## Chủ cửa hàng

1. Vào **Quản trị → Hoàn tiền**. Bộ lọc **Chưa hoàn** gồm yêu cầu đang chờ và đang xử lý.
2. Bấm **Xử lý hoàn tiền**. Nếu khách đã gửi tài khoản, thao tác này tiếp nhận yêu cầu, khóa tài khoản nhận và gửi thông báo cho khách. Nếu chưa có tài khoản, chờ khách bổ sung trong chi tiết đơn.
3. Sao chép số tài khoản, số tiền và nội dung. Chuyển khoản bằng ứng dụng ngân hàng; kiểm tra tên người nhận hiển thị trong ứng dụng trước khi chuyển.
4. Sau khi chuyển thành công, nhập **Mã giao dịch hoàn tiền**, đánh dấu **Đã hoàn đủ tiền thực tế**, bấm **Xác nhận đã hoàn tiền**.
5. Xem lại tại bộ lọc **Đã hoàn tiền**. Nếu lần trước đã chuyển nhưng chưa lưu xác nhận trên web, kiểm tra lịch sử ngân hàng và ghi nhận giao dịch đó, không chuyển thêm lần nữa.

Web không tự chuyển tiền. Xác nhận hoàn tiền là bản ghi của cửa hàng, không phải xác nhận độc lập từ ngân hàng rằng khách đã nhận tiền. Chỉ hỗ trợ hoàn toàn bộ số tiền của đơn đủ điều kiện; không đặt thời hạn hoàn tiền khi cửa hàng chưa có chính sách thực tế.

Yêu cầu cũ đã đối soát tài khoản ngoài web vẫn có thể dùng biểu mẫu xác nhận cũ trong trang duyệt đơn. Yêu cầu đã có tài khoản gửi trên web phải được tiếp nhận trước khi xác nhận hoàn tất.

## Quyền và dữ liệu

- Khách chỉ xem/sửa thông tin nhận tiền của mình. Số tài khoản được che trong phần tóm tắt.
- Chỉ ADMIN được mở danh sách và xử lý hoàn tiền. STAFF không có quyền xem tài khoản ngân hàng tại mục này.
- Dữ liệu ngân hàng không xuất hiện trong API thanh toán thông thường, thông báo hoặc nhật ký quản trị. Kiểm tra đầu vào chỉ xác nhận định dạng, không xác minh tài khoản ngân hàng có thật.
- Trạng thái thanh toán gốc vẫn là `PAID`; `refundStatus` lưu riêng `REQUESTED → PROCESSING → COMPLETED`. Khoản hoàn đã hoàn tất được trừ khỏi doanh thu theo quy tắc báo cáo hiện có.

## Mã nguồn

- `client/src/AdminRefunds.tsx`: danh sách, tiếp nhận, sao chép thông tin.
- `client/src/RefundRecipient.tsx`: khách gửi tài khoản nhận tiền.
- `client/src/RefundStatus.tsx`: tiến độ và xác nhận chuyển khoản.
- `client/src/Account.tsx`: chi tiết đơn khách hàng và cập nhật trạng thái định kỳ.
- `server/src/modules/payments/refund-workflow.service.ts`: quyền sở hữu, thông tin nhận tiền, tiếp nhận và danh sách.
- `server/src/modules/payments/refund.service.ts`: kiểm tra và ghi nhận hoàn tiền, chống xác nhận trùng.
- `server/src/modules/payments/payment.model.ts`: trạng thái, thời điểm và dữ liệu tài khoản được ẩn mặc định.
- `server/tests/shopping-completion.test.ts`, `client/e2e/refund-workflow.spec.ts`: kiểm thử nghiệp vụ, quyền, gửi lặp và giao diện.
