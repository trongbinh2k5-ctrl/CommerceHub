# CommerceHub

Hệ thống thương mại điện tử với Express/MongoDB và frontend React/TypeScript.

- `server/`: API, nghiệp vụ, bảo mật và kiểm thử backend.
- `client/`: storefront và trang quản trị, kết nối API thật.

**Bắt đầu tự quản lý dự án:** [Hướng dẫn tự vận hành — chạy web, điều hành cửa hàng và bản đồ file](HUONG-DAN-TU-VAN-HANH.md).

Quản lý tài khoản chủ cửa hàng: [Hướng dẫn chi tiết tạo, thay thế, khóa và xóa admin](HUONG-DAN-TAO-VA-XOA-ADMIN.md).

Hướng dẫn chạy backend, frontend và bản demo database tạm: [client/README.md](client/README.md).

Nhập/xuất Excel, file mẫu, cập nhật theo SKU và điều chỉnh kho: [Hướng dẫn Excel](EXCEL-GUIDE.md).

Đợt bổ sung nghiệp vụ khách hàng ngày 04/11/2026: [chức năng, cấu hình email và giới hạn tích hợp](COMPLETENESS.md). Trang quản trị có mục **Cửa hàng**, **Tài khoản**, **Đổi trả / Bảo hành** và **Lịch sử kho**. Dữ liệu SKU/chính sách chưa có thông tin thật được để trống và hiển thị chưa cập nhật.

Quản lý nhân viên ngày 06/11/2026: [tạo nhân viên, mật khẩu tạm, đổi mật khẩu bắt buộc và nhật ký quản trị](STAFF-MANAGEMENT.md).

## Nhánh phát triển

- `frontend/custom-design`: backend nền, dành cho tự thiết kế frontend dần.
- `frontend/full-implementation`: frontend hoàn chỉnh các luồng chính và backend tích hợp.

## Tài liệu

- [Deploy miễn phí lên Render từng bước](DEPLOY-RENDER.md)
- [Tổng kết kiểm tra cuối ngày 24/11/2026 và các giới hạn còn lại](FINAL-REVIEW-2026-11-24.md)
- [Kiến thức, câu hỏi và cách demo dự án khi phỏng vấn](INTERVIEW-GUIDE.md)
- [Bảo mật backend](server/SECURITY.md)
- [Báo cáo kiểm thử backend ban đầu](server/SYSTEM-TEST-REPORT.md)
- [Frontend và cách chạy](client/README.md)
- [Nguồn ảnh và prompt thiết kế](client/ASSETS.md)
- [Chat cửa hàng, chatbot demo và cách tích hợp AI sau này](CHAT-GUIDE.md)
- [Cấu hình Gmail thật cho bản demo local](GMAIL-SETUP.md)
- [Tổng kiểm thử toàn hệ thống ngày 10/11/2026](QA-REPORT-2026-11-10.md)
- [Tổng kiểm thử toàn hệ thống ngày 12/11/2026](QA-REPORT-2026-11-12.md)
- [Tổng kiểm tra và hoàn thiện ngày 24/11/2026](QA-REPORT-2026-11-24.md)
- [Rà soát bảo mật mã nguồn ngày 12/11/2026](SECURITY-REVIEW-2026-11-12.md)

- [Sổ tay các lỗ hổng, cách sửa và hướng nghiên cứu](SECURITY-STUDY.md)
- [Cấu hình SePay Sandbox và kiểm tra thanh toán](SEPAY-SETUP.md)
- [Cấu hình GHN test và vận hành giao hàng](GHN-SETUP.md)
- [Hoàn tiền thủ công: thao tác cho chủ cửa hàng và trạng thái khách hàng](REFUND-GUIDE.md)

## Danh mục sản phẩm đã tra cứu

Đã bổ sung sản phẩm và hoàn thiện trang danh mục/thương hiệu. Danh sách, nguồn hãng và cách cập nhật giá/tồn kho tại [CATALOG-SOURCES.md](CATALOG-SOURCES.md).
