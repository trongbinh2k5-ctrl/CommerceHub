# Báo cáo kiểm thử CommerceHub

Ngày thực hiện: 02/11/2026 (Asia/Saigon).

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck` | Đạt |
| `npm run build` | Đạt |
| `npm test` sau khi bổ sung system-core | 115/115 đạt, không bỏ qua |
| Unit test reviews và shipping trong src | 19/19 đạt |

Tổng cộng 134 mục kiểm thử theo số đếm của Node test runner. Số này bao gồm các bài test cha chứa subtest, không phải 134 kịch bản nghiệp vụ độc lập.

## Phạm vi đã chạy

- Xác thực: đăng ký, email trùng, dữ liệu thiếu, chống tự gán ADMIN, đăng nhập, sai mật khẩu, token sai, tài khoản bị khóa và phân quyền.
- Danh mục và sản phẩm: tạo qua API nhân viên, slug trùng, danh sách công khai, chi tiết, giá âm và truy vấn phân trang sai.
- Địa chỉ: tạo, cập nhật, xóa, số điện thoại sai và ngăn cập nhật địa chỉ của tài khoản khác.
- Giỏ hàng: thêm, sửa số lượng, từ chối số lượng âm, đọc, xóa một mục và xóa giỏ.
- Đặt hàng/thanh toán: idempotency, yêu cầu đồng thời, chống bán vượt tồn, rollback, quyền sở hữu, COD, xác nhận đồng thời, hủy đơn và migration.
- Vận chuyển: 22 kịch bản tích hợp về quyền, tạo vận đơn, tracking, chuyển trạng thái, giao thất bại, giới hạn số lần giao và hoàn hàng.
- Đánh giá: 20 kịch bản tích hợp về điều kiện mua hàng, validation, quyền sở hữu, kiểm duyệt, xóa mềm, thống kê và cập nhật đồng thời; thêm 12 unit test.
- Mã giảm giá: 14 kịch bản về hiệu lực, giới hạn sử dụng, tranh chấp lượt cuối, rollback, replay và hủy đơn.
- Dashboard: 18 kịch bản về phân quyền, doanh thu, trạng thái đơn, sản phẩm bán chạy, tồn thấp và tham số sai.
- HTTP: health, endpoint cần đăng nhập và JSON sai cú pháp.

Bổ sung bộ kiểm thử tái sử dụng: `tests/system-core.test.ts` (9 subtest). Tất cả kiểm thử tích hợp dùng HTTP cục bộ và MongoDB replica set tạm thời, không dùng `.env` hay sửa dữ liệu ứng dụng hiện có. Các tiến trình và database tạm được dọn sau khi chạy.

## Vấn đề ghi nhận

1. `package.json`: `test:reviews` trỏ tới `tests/review-rules.test.ts`, trong khi file thực tế là `src/modules/reviews/review-rules.test.ts`. Cần sửa đường dẫn trước khi dùng lệnh này.
2. `npm test` chỉ tìm `tests/*.test.ts`, nên bỏ sót 19 unit test của reviews/shipping trong `src`. Đợt kiểm thử này đã chạy riêng cả hai file bằng `npx tsx --test src/modules/reviews/review-rules.test.ts src/modules/shipping/shipping-ruler.test.ts`.
3. Mongoose phát cảnh báo option `new` của `findOneAndUpdate`/`findOneAndReplace` đã deprecated; nên chuyển sang `returnDocument: 'after'`. Không gây thất bại trong lần chạy này.
4. `typecheck` chỉ bao gồm `src` theo tsconfig hiện tại; các test trong `tests` được thực thi bằng tsx nhưng không được lệnh này kiểm tra kiểu.

## Giới hạn

Workspace hiện chỉ có backend; chưa có giao diện để kiểm thử trình duyệt. Chưa đo tải/hiệu năng, độ bao phủ dòng mã, kiểm toán dependency, hay kiểm thử môi trường triển khai và dịch vụ bên ngoài. Kết quả đạt xác nhận những kịch bản đã chạy, không bảo đảm mọi trường hợp của hệ thống đều không có lỗi. Không thay đổi mã nghiệp vụ trong đợt kiểm thử này.

Một số lần chạy bị sandbox chặn tạo tiến trình (`spawn EPERM`); đã chạy lại ngoài sandbox thành công. Đây là hạn chế môi trường chạy, không tính là lỗi ứng dụng.
