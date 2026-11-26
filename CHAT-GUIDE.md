# Chat BerylCore

## Dùng ở đâu?

- Khách: nút **Chat hỗ trợ** ở góc phải hoặc **Tài khoản → Tin nhắn & tư vấn**. Trang lịch sử: `/messages`.
- Trang sản phẩm: **Hỏi về sản phẩm** mở chat và đính kèm thẻ sản phẩm khi gửi.
- Nhân viên/admin: **Quản trị → Hội thoại**, đường dẫn `/admin/chat`.
- Khách chưa đăng nhập được thử bot. Phiên khách chỉ giữ tối đa 40 tin trong bộ nhớ cửa sổ, không lưu vào tài khoản. Đăng nhập trước khi chat với nhân viên hoặc để lưu lịch sử bot.

## Quy trình nhân viên

1. Mở hội thoại **Chờ tiếp nhận** và bấm **Tiếp nhận hội thoại**.
2. Nhập và gửi câu trả lời. Một hội thoại chỉ có một người phụ trách; người khác không thể nhận hoặc trả lời trùng.
3. Admin có thể chọn người phụ trách và bấm **Phân công**. Nhân viên cũ mất quyền truy cập sau khi chuyển.
4. Bấm **Đóng hội thoại** khi xử lý xong. Lịch sử vẫn được lưu; khách có thể bắt đầu hội thoại mới. Admin mở lại hội thoại cũ nếu khách chưa có hội thoại cùng loại đang mở.

Nhân viên thấy hàng chờ và hội thoại của mình. Admin thấy toàn bộ chat cửa hàng. Nhân viên và admin không được mở lịch sử bot riêng của khách. Khi chuyển từ bot sang người bán, khách chỉnh sửa và xác nhận bản tóm tắt; hệ thống chỉ gửi nội dung đã xác nhận.

## Bot demo làm được gì?

- Lọc danh mục, thương hiệu và ngân sách: “Laptop ASUS từ 10 đến 20 triệu”, “Chuột Logitech còn hàng”, “Laptop rẻ nhất”.
- Nhận tên gọi tương đương như notebook/laptop, monitor/màn hình, keyboard/bàn phím; hiểu tiếng Việt không dấu và “ko”.
- Hiểu khoảng giá, `500k`, `1,5 triệu`, `20tr`, số tiền có dấu phân cách và từ chối khoảng giá bị đảo ngược.
- Hỗ trợ câu hỏi nối tiếp trong ba câu hỏi gần nhất, ví dụ “Tìm màn hình” → “Dưới 5tr thôi” → “Còn hàng ko?”. Danh mục mới sẽ bắt đầu bộ lọc mới.
- Tra giá, tồn kho và thông số khi có ngữ cảnh sản phẩm đính kèm.
- Đọc chính sách bảo hành/đổi trả/giao hàng và thông tin liên hệ đã được admin cập nhật.
- Hướng dẫn tra cứu đơn ở tài khoản; bot không đọc hoặc thay đổi đơn.
- Hướng dẫn đăng ký/đăng nhập, quên/đổi mật khẩu, giỏ hàng, thanh toán và nhập mã giảm giá. Không tự tạo mã hoặc hứa hỗ trợ trả góp.
- Gặp câu hỏi ngoài kịch bản sẽ hướng dẫn diễn đạt lại hoặc gặp nhân viên.

Đây **chưa phải mô hình AI**. Việc “huấn luyện thêm” là mở rộng bộ nhận diện, kịch bản và tập câu hỏi kiểm thử, không huấn luyện trọng số mô hình. Bot chỉ nhớ ngữ cảnh ba câu hỏi gần nhất trong cùng hội thoại, không suy luận cấu hình và không đảm bảo tư vấn tương thích linh kiện. Giá 0 hiển thị “Liên hệ báo giá”, bị loại khỏi bộ lọc ngân sách và xếp giá rẻ nhất. Giá/tồn kho trên thẻ chat là ảnh chụp dữ liệu khi trả lời; mở trang sản phẩm để xem hiện tại. Chính sách trống được báo là chưa công bố. Giao diện dùng nhãn “Trợ lý tự động”, không lặp dòng kỹ thuật “Demo theo kịch bản”.

## Sửa phần nào ở file nào?

| File | Trách nhiệm |
|---|---|
| `client/src/Chat.tsx` | Cửa sổ chat, hộp thư khách/nhân viên, gợi ý câu hỏi, chuyển tiếp và gửi lại |
| `client/src/chat.css` | Màu sắc, kích thước, bố cục máy tính/điện thoại |
| `client/src/App.tsx` | Gắn cửa sổ chat và route `/messages` |
| `client/src/Admin.tsx` | Mục Hội thoại trong quản trị |
| `client/src/Store.tsx` | Nút Hỏi về sản phẩm |
| `server/src/modules/chat/chat.provider.ts` | Quy tắc nhận diện câu hỏi, lọc dữ liệu và nội dung bot |
| `server/src/modules/chat/chat.understanding.ts` | Từ đồng nghĩa, viết tắt, phân tích giá, thương hiệu, ngữ cảnh và FAQ |
| `server/src/modules/chat/chat.router.ts` | API, quyền truy cập, phân công, lưu/gửi/đọc tin |
| `server/src/modules/chat/chat.models.ts` | Cấu trúc hội thoại và tin nhắn, chỉ mục chống trùng |
| `server/tests/chat.test.ts` | Kiểm thử quyền truy cập, giao dịch, bot và phân trang |
| `server/tests/chat-understanding.test.ts` | Bộ câu hỏi mẫu và kết quả mong đợi; thêm ví dụ khi mở rộng khả năng hiểu |
| `client/e2e/chat.spec.ts` | Kiểm thử toàn luồng trên trình duyệt |

Đổi nội dung chính sách ở **Quản trị → Cửa hàng**; cập nhật giá/tồn kho/thông số ở **Quản trị → Thiết bị**. Bot đọc trực tiếp các dữ liệu này, không cần sửa mã để cập nhật nội dung cửa hàng.

## Sau này kết nối AI

`AssistantProvider` định nghĩa hàm `reply(text, productId?, context?)` và kết quả `{ text, cards? }`. Tạo một adapter triển khai interface này rồi thay `scriptedAssistant` mà router gọi. Ngữ cảnh đăng nhập do server lấy từ lịch sử thuộc đúng khách hàng; phiên khách chỉ gửi tối đa ba câu hỏi, mỗi câu tối đa 2000 ký tự và không cấp quyền truy cập dữ liệu riêng. Giữ khóa nhà cung cấp trong biến môi trường **backend**, không dùng `VITE_...` cho khóa bí mật.

Khi tích hợp thật cần thêm timeout, giới hạn chi phí/token, xử lý lỗi nhà cung cấp và kiểm thử chống lộ dữ liệu. Nếu muốn thêm tra cứu đơn, chỉ truy vấn bằng userId lấy từ phiên đăng nhập trên server; interface hiện tại cố ý không cấp quyền đọc đơn. Lịch sử và quyền truy cập vẫn do module chat quản lý. Hiện tại không có khóa, không gọi mạng tới nhà cung cấp AI và không cần GPU.

## Chạy và kiểm tra

Chạy frontend/backend theo quy trình hiện tại. Backend đã yêu cầu MongoDB có transaction cho nhiều chức năng; chat sử dụng cùng cơ chế này. Các chỉ mục được tạo khi khởi động qua `model.init()`, không cần sửa dữ liệu tài khoản.

Tin nhắn được tự đồng bộ bằng **HTTP polling**: nội dung mỗi 3 giây, danh sách mỗi 5 giây, tổng chưa đọc mỗi 15 giây. Polling tạm dừng ở tab nền theo cơ chế thư viện và cập nhật khi quay lại. Chưa dùng Socket.IO, chưa có trạng thái đang gõ/đang online. Không hiển thị cam kết thời gian phản hồi. Đã đọc được lưu khi người dùng đang xem cuối hội thoại; hàng chờ không bị đánh dấu đã đọc trước khi nhân viên nhận.

Tin chỉ báo thành công sau khi lưu transaction. Mã clientId được giữ khi gửi lại trong cùng phiên cửa sổ để chống trùng. Nếu tải lại trang sau lỗi mạng, kiểm tra lịch sử trước khi nhập lại. Mỗi lần lấy tối đa 50 tin, có nút tải lịch sử cũ. Danh sách hội thoại phân trang 30 mục. Có giới hạn độ dài và tần suất gửi; bản này chỉ hỗ trợ văn bản/thẻ sản phẩm, chưa nhận file hoặc ảnh đính kèm.

Kiểm thử dùng database tạm, không dùng MongoDB thật:

```powershell
cd D:\CommerceHub\server
node --import tsx --test tests/chat.test.ts
npm run typecheck
```

```powershell
cd D:\CommerceHub\client
npm run build
npx playwright test e2e/chat.spec.ts
```

Playwright tự chạy backend demo tại 5001 và frontend preview 4173. Các tài khoản `customer@demo.local`, `staff@demo.local`, `admin@demo.local` với mật khẩu `DemoCommerce!2026` chỉ thuộc môi trường tạm này. Chat demo mất khi tắt backend demo; chat ở database ứng dụng được lưu bình thường.
