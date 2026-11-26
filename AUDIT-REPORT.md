# Kiểm tra và sửa lỗi CommerceHub

Cập nhật kiểm tra nghiệp vụ: **04/11/2026**. Các mục thiết kế bên dưới ghi lại lịch sử các lượt trước.

Đã rà soát frontend React/TypeScript và các module backend Express/MongoDB; chạy build, bộ kiểm thử backend, unit test frontend và kiểm thử trình duyệt. Các thay đổi có sẵn trong thư mục làm việc được giữ lại.

## Quản lý nhân viên — 06/11/2026

Đã bổ sung admin tạo nhân viên trực tiếp, mật khẩu tạm ngẫu nhiên có hạn 24 giờ, xác nhận mật khẩu admin khi cấp/cấp lại, chặn nghiệp vụ ở backend đến khi đổi mật khẩu riêng, thu hồi các phiên cũ và nhật ký quản trị theo giao dịch. STAFF/ADMIN có trang tự quản lý hồ sơ, mật khẩu và phiên đăng nhập. Quy trình, giới hạn và phạm vi nhật ký tại [STAFF-MANAGEMENT.md](STAFF-MANAGEMENT.md).

Kết quả mới nhất: build backend/frontend thành công, **189/189 ca backend, 17/17 ca frontend và 20/20 ca E2E Edge đạt**. Đã kiểm tra lỗi audit làm hoàn tác tạo nhân viên/điều chỉnh kho/đổi mật khẩu, mật khẩu tạm hết hạn, gọi API bỏ qua màn hình thiết lập, thu hồi token, quyền đọc nhật ký và xác nhận COD đồng thời. Chỉ dùng database tạm cho kiểm thử ghi; tài khoản thật được giữ nguyên.

## Bổ sung nghiệp vụ ngày 04/11/2026

Trạng thái hiện tại, chức năng đã làm, cấu hình email và những phần cần dịch vụ/dữ liệu thật được ghi trong [COMPLETENESS.md](COMPLETENESS.md). Bảng màu hiện tại là xanh dương/cam ấm theo yêu cầu khôi phục của người dùng. Các mô tả màu graphite hoặc chức năng “chưa có refresh/upload” ở lịch sử bên dưới không còn là trạng thái hiện tại.

Build backend/frontend đạt; 173/173 ca backend, 15/15 ca frontend, 19/19 ca E2E Edge và 1/1 kiểm tra storefront thật chỉ đọc đạt. Chức năng gửi mail thật vẫn tắt, thông số SKU và chính sách chưa được cửa hàng xác nhận được giữ ở trạng thái chưa cập nhật.

## Lịch sử thiết kế lại cửa hàng

Người dùng đã chọn rõ hướng **“Sáng, tối giản, ảnh lớn”**, sau đó yêu cầu chỉnh tiếp cả chữ/khoảng cách, tỷ lệ ảnh và nút. Bố cục hiện bỏ banner tối và thẻ nổi, dùng ảnh thật lớn với tên model dưới ảnh; giá giữ trong lưới để tránh lặp. Header desktop gộp một hàng, menu tablet/mobile mở khi cần. Đã giảm khoảng trắng cộng dồn, bỏ nhãn và liên kết phụ trùng, tăng độ rõ của chữ phụ, căn tên/giá theo mép ảnh và chuẩn hóa nút mũi tên 44px. Nền trắng/xám sáng, chữ và nút graphite, một điểm màu đỏ trầm nhỏ. `storefront.css` được viết lại và tải sau UI chung; bỏ các rule storefront cũ khỏi UI để giảm chồng kiểu.

Danh mục đổi thành dải liên kết gọn thay ô rộng toàn hàng. Thẻ sản phẩm bỏ khung ngoài, bóng và nút mũi tên; tăng vùng ảnh, giữ tên hai dòng và giá/trạng thái riêng để các hàng thẳng nhau. Trang chủ đưa sản phẩm còn hàng lên trước trong bốn mục đã tải. Bộ lọc mobile thu gọn, có số điều kiện và xóa nhanh; lỗi danh mục vẫn hiện khi bộ lọc đóng. Thêm mức giá 10/20/40 triệu phù hợp dữ liệu laptop. Ảnh thiếu vẫn ghi nhãn minh họa/placeholder; ảnh hero đầu trang tải ưu tiên. Ảnh giới thiệu khi chưa có dữ liệu được ghi nhãn rõ.

- Thống nhất kích thước, bo góc, khoảng cách icon/chữ và trạng thái hover/focus/disabled của nút. Thao tác bảng và địa chỉ có khung nút rõ ràng; hành động chính và xóa/hủy được phân biệt.
- Đồng bộ ô nhập, bộ lọc, thẻ sản phẩm, giỏ hàng, tổng tiền, nhãn trạng thái, dialog và sidebar quản trị. Giữ Inter; nhãn trạng thái từ 13px và placeholder tăng độ tương phản.
- Header điện thoại giữ logo và các nút trên cùng hàng; nút tài khoản, giỏ hàng, menu và quản trị có vùng bấm 44px. Biểu tượng quản trị có tên truy cập. Biểu đồ doanh thu giới hạn độ rộng cột để một ngày dữ liệu không thành khối trải kín khung.
- Tiếp tục dùng ảnh web đã gắn cho bốn sản phẩm thật; lượt thiết kế lại không sửa dữ liệu sản phẩm.

Sau thiết kế lại: build và **13/13 unit test frontend** đạt; **16/16 E2E đầy đủ** đạt. Bộ 16 E2E cũng đã chạy lại thành công sau lượt tinh chỉnh header, chữ, ảnh và nút. Kiểm tra chỉ đọc storefront thật **1/1 đạt**. Đã xem ảnh chụp cửa hàng thật desktop/mobile và các màn hình quản trị, giỏ hàng, đăng nhập, dialog. Kiểm tra bố cục công khai bao gồm 320, 390, 768, 1101, 1180 và 1280px; có thêm kiểm tra header khách hàng ở 1101px. Phạm vi trình duyệt là Edge. Lượt này sửa Home/App/Store, thành phần ảnh/thẻ sản phẩm và stylesheet; backend/database không thay đổi.

Ảnh cửa hàng thật: [desktop](client/qa/redesign/live-home-desktop.png), [mobile](client/qa/redesign/live-home-mobile.png). Ảnh quản trị dùng database demo tạm: [thiết bị](client/qa/visual/admin-products-1280.png), [tổng quan](client/qa/visual/admin-overview-1280.png). Tổng quan trong kiểm tra bố cục dùng response dựng sẵn để giữ tình huống biểu đồ chỉ có một ngày dữ liệu; kiểm thử nghiệp vụ tiếp tục dùng API/database tạm thật.

## Lịch sử cập nhật ảnh web và typography

Sau khi người dùng giao chọn model cho các tên laptop thử, đã chuẩn hóa và **lưu ảnh cho 4/4 bản ghi thực tế**:

- Laptop No Category… → ASUS Vivobook 15 X1504, ảnh từ [ASUS](https://www.asus.com/laptops/for-home/vivobook/asus-vivobook-15-x1504/).
- Laptop Rog Strix… → ASUS ROG Strix G16 (2024) G614, ảnh từ [gallery ASUS](https://rog.asus.com/laptops/rog-strix/rog-strix-g16-2024/gallery/).
- Laptop Test → ASUS TUF Gaming F15 (2023) FX507, ảnh từ [ASUS](https://www.asus.com/laptops/for-gaming/tuf-gaming/asus-tuf-gaming-f15-2023/).
- Intel Core i5-14600K giữ tên; ảnh hộp + CPU từ [Newegg đúng model](https://www.newegg.com/p/N82E16819118470), đối chiếu [mã BX8071514600K từ Intel](https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/ordering.html).

Ảnh đã tải vào `client/public/images/products/` và được kiểm tra nội dung/MIME trước khi lưu đường dẫn vào database. Đã chạy kế hoạch ở chế độ xem trước, tạo backup tại `.local/product-photo-backups/1793708939670.json`, rồi cập nhật bốn bản ghi trong một transaction. **Giá, tồn kho, SKU và danh mục giữ nguyên**. Chạy lại chế độ xem trước trả `changes: []`. Script có kiểm tra tên cũ, ảnh trống, timestamp và file ảnh tồn tại để tránh ghi đè thay đổi đồng thời.

Phông hiện tại đã đổi từ Be Vietnam Pro sang **Inter**, đóng gói đầy đủ tiếng Việt; body 400, nhãn 500, tiêu đề/giá 600, logo 700. Đã bỏ trộn serif trong nội dung, giãn chữ âm, các chữ nhỏ dưới 13px, khẩu hiệu in hoa/tiếng Anh và các khối quảng bá lặp. Trang chủ tập trung vào tiêu đề rõ, danh mục, sản phẩm và thông tin mua hàng. Các phần ghi Be Vietnam Pro/ảnh minh họa bên dưới là lịch sử những lượt trước.

Build frontend/backend đạt; 13 unit test frontend và **16/16 E2E đạt** sau thay đổi. Bộ chụp storefront thật xác nhận ảnh và bố cục desktop/mobile, ảnh mới tại [desktop](client/qa/redesign/live-home-desktop.png) và [mobile](client/qa/redesign/live-home-mobile.png). Nguồn ảnh đầy đủ tại [ASSETS.md](client/ASSETS.md).

## Lịch sử điều chỉnh storefront và ảnh theo dữ liệu thật

Kiểm tra cửa hàng đang chạy tại cổng 5173 xác nhận **4/4 sản phẩm thật có `imageUrl` rỗng**, chỉ có một danh mục công khai và 3/4 sản phẩm hết hàng. Các ảnh có sẵn và bộ kiểm tra ban đầu thuộc dữ liệu demo; việc kiểm chứng demo trước đó chưa phản ánh độ đầy đủ ảnh của database thực tế.

Đã thay trang chủ tai nghe bằng hình chiến dịch laptop, nền mực đen/cobalt, ô sản phẩm lấy từ API và ưu tiên sản phẩm còn hàng, danh mục tự co theo số lượng thực tế, thẻ sản phẩm có khung ảnh đồng nhất và giá/trạng thái rõ hơn. Trang mobile rút gọn phần chữ phụ để hình xuất hiện sớm hơn. Tên, giá và tồn kho của dữ liệu thật giữ nguyên.

Khi chưa có URL ảnh, nhóm laptop/CPU dùng ảnh AI minh họa có nhãn **“Ảnh minh họa”**, cả ở thẻ và chi tiết; ảnh thật đã nhập vẫn có ưu tiên. Không ghi ảnh AI vào database và không khẳng định chúng là ảnh của model/SKU đang bán. Nhóm chưa xác định vẫn dùng placeholder. Bộ hình cuối và prompt image_gen tích hợp được lưu trong [client/ASSETS.md](client/ASSETS.md).

Trang quản trị có thumbnail/nhãn “Chưa có ảnh”, bộ lọc ảnh thiếu trên trang hiện tại và preview URL trước khi lưu; preview không tải URL sai định dạng hoặc chứa credentials. Chưa có API upload file.

Đã kiểm tra **chỉ đọc** trực tiếp cửa hàng thật, ảnh tải thành công và không tràn ngang ở desktop/mobile: [desktop](client/qa/redesign/live-home-desktop.png), [mobile](client/qa/redesign/live-home-mobile.png), [chi tiết sản phẩm](client/qa/redesign/live-product-desktop.png). Bản build, 13 unit test và **16/16 E2E** đều đạt; kiểm tra storefront thật riêng cũng đạt. E2E thêm tình huống phân biệt ảnh minh họa với ảnh đã nhập và kiểm tra preview/xóa URL nháp mà không lưu dữ liệu.

## Rà soát giao diện bổ sung

Sau phản hồi về phông chữ, đã kiểm tra riêng phần hiển thị và tương tác, bổ sung các sửa đổi:

- Đóng gói **Be Vietnam Pro** cùng ứng dụng ở trọng lượng 400/500/600/700/800, có glyph tiếng Việt; bỏ việc tải phông qua Google Fonts và các khai báo DM Mono thiếu fallback. Giữ giấy phép phông trong `client/public/fonts/OFL-BeVietnamPro.txt`.
- Tăng cỡ chữ nội dung chính lên khoảng 14–16px; ô nhập liệu trên điện thoại dùng 16px. Nới khoảng cách chữ/chiều cao dòng của tiêu đề tiếng Việt, tăng tương phản nhãn trạng thái và placeholder.
- Giữ thanh tìm kiếm trên điện thoại; chỉnh header ở 320px, ngăn tên/địa chỉ/từ khóa dài làm tràn trang và sửa đường chia lưới danh mục nhiều hàng.
- Bảng quản trị có độ rộng cột đủ đọc, vùng cuộn ngang dùng được bằng bàn phím và hướng dẫn trên mobile; ô tìm kiếm không bị nút xuất CSV ép quá hẹp.
- Dialog có tên truy cập, khóa cuộn nền, khôi phục focus; menu có nhãn mở/đóng và hỗ trợ Escape. Icon tài khoản và xuất CSV có tên truy cập.
- Hiện lỗi/tải lại danh mục trong bộ lọc; sửa input khi sản phẩm hết hàng và đồng bộ giới hạn các trường vận chuyển/coupon với backend.
- Cập nhật Vitest từ 3.2.7 lên **4.1.12** để xử lý cảnh báo đã xác minh; `npm audit --json --offline=false --prefer-online` sau cập nhật trả **0 vulnerabilities**.

Kiểm tra phông đã chặn truy cập Google Fonts, tải đủ các weight tiếng Việt, và dùng dữ liệu font thực sự được trình duyệt render để xác nhận Be Vietnam Pro được sử dụng. Kiểm tra bố cục ở **320, 390, 768 và 1280px**, gồm trang chủ, catalogue, chi tiết sản phẩm, đăng nhập/đăng ký, câu chuyện, giỏ hàng, checkout, tài khoản, đơn hàng, địa chỉ, dialog đánh giá và 8 mục quản trị. Các kiểm tra mobile xác minh không tràn ngang toàn trang; bảng có cuộn ngang riêng.

Ảnh sau sửa: [desktop](client/qa/visual/home-1280.png), [mobile](client/qa/visual/home-390.png), [chi tiết sản phẩm](client/qa/visual/product-390.png), [quản trị 320px](client/qa/visual/admin-products-320.png). Các dữ liệu dài ở tài khoản/checkout được dựng riêng cho kiểm tra bố cục; các luồng API thật tiếp tục được kiểm tra trong bộ E2E ban đầu.

## Các lỗi đã sửa

| Phần | Lỗi và kết quả sau sửa |
| --- | --- |
| Tìm kiếm | Ô tìm kiếm ở header và bộ lọc đồng bộ với URL khi tìm tiếp hoặc dùng Back/Forward. |
| Sắp xếp | Giá trở thành tiêu chí chính khi chọn tăng/giảm; ID chỉ phân định giá bằng nhau. “Mới nhất” dùng thời điểm tạo, rồi ID để phân trang ổn định. |
| Ảnh sản phẩm | Ảnh hỏng hiện placeholder có tên truy cập được; đổi nguồn ảnh không giữ trạng thái ẩn của ảnh trước. |
| Quản lý sản phẩm | Xóa được ảnh, mô tả và danh mục đã chọn; sửa trường khác không làm mất danh mục đang bị ẩn. Backend kiểm tra mô tả, tồn ban đầu và lưu tồn ban đầu hợp lệ. |
| Danh mục | Bộ lọc chấp nhận ID viết hoa; chi tiết và danh sách cùng ẩn sản phẩm có danh mục bị thiếu hoặc vô hiệu hóa. |
| Giỏ hàng | ID viết hoa không tạo dòng trùng hoặc làm sai thao tác sửa/xóa. Backend từ chối số lượng vượt tồn, trả tồn hiện tại và lý do không khả dụng. Giao diện cho giảm thẳng về mức tồn còn lại. |
| Hủy đơn | Khách chỉ được đề nghị hủy đơn PENDING theo quy tắc backend; sau hủy, thanh toán, vận đơn và danh sách đơn được tải lại. |
| Vận chuyển | Tạo vận đơn và hủy đơn có khóa chung trong transaction, ngăn vận đơn READY đi cùng đơn CANCELLED. Kiểm tra phương thức thanh toán nhất quán. Giao thất bại/hoàn hàng yêu cầu ghi chú trên giao diện. |
| Đánh giá | PATCH hỗ trợ version của biểu mẫu, ngăn ghi đè từ tab cũ. Giao diện báo xung đột và yêu cầu mở lại bản mới; thêm/sửa/xóa làm mới danh sách và điểm tổng hợp. Có phân trang và điều chỉnh trang khi dữ liệu giảm. |
| Điều hướng | Tab tài khoản không hợp lệ quay về danh sách đơn; giữ query string của đường dẫn yêu cầu đăng nhập. |
| Phân trang | Quản trị dùng tổng số trang backend thay vì suy đoán từ số dòng. Backend chặn offset không an toàn và tham số vận chuyển sai định dạng; báo cáo từ chối tham số period lặp. |
| Phiên đăng nhập/API | Phản hồi 401 của token cũ không đăng xuất phiên mới; đổi tài khoản xóa thông báo cũ. Xử lý response 204, giữ data:null và báo lỗi rõ khi response thành công chứa JSON không hợp lệ. |
| Khởi động database | Chờ các model đã đăng ký khởi tạo collection/index trước khi nhận request, gồm các ràng buộc duy nhất của đơn hàng, thanh toán, vận đơn và đánh giá. |

## Kết quả kiểm chứng cuối

| Kiểm tra | Kết quả |
| --- | --- |
| `server`: `npm run build` | Đạt |
| `server`: `npm test` | **159/159 đạt**, không bỏ qua test |
| `client`: `npm run build` | Đạt |
| `client`: `npm test` | **13/13 đạt** |
| `client`: `npx playwright test` | **16/16 đạt** trên Edge |
| `client`: `npx playwright test --config playwright.live.config.ts` | **1/1 đạt**, chỉ đọc storefront thật cổng 5173 |

Backend kiểm tra đăng ký/đăng nhập, phân quyền và cô lập tài khoản, danh mục/sản phẩm, địa chỉ, giỏ hàng, giao dịch đặt hàng, idempotency, tồn kho, coupon, COD, vận chuyển, đánh giá, dashboard và các kiểm tra bảo mật HTTP hiện có.

E2E kiểm tra catalogue, đặt hàng thật qua API, quản trị sản phẩm/đơn/vận đơn/thu COD, đánh giá, quyền STAFF, giao diện mobile 390px, lỗi API, đồng bộ tìm kiếm và sắp xếp, placeholder ảnh, xóa trường sản phẩm, hủy đơn và phục hồi giỏ hàng khi tồn giảm. Tình huống ảnh hỏng và tồn giảm dùng response được dựng riêng để tái hiện ổn định; các quy tắc backend tương ứng được kiểm tra riêng với MongoDB thật dạng replica set tạm.

Kiểm thử đồng thời đánh giá đã được điều chỉnh để hai request gửi cùng version và không giả định request nào thắng; vẫn yêu cầu một request thành công, một request xung đột và điểm tổng hợp khớp dữ liệu đã lưu.

## Phạm vi còn lại

- Các luồng đặt/hủy đơn và kiểm thử quản trị chạy với database tạm. Bốn thay đổi tên/model/ảnh trong database thật đã được người dùng giao lựa chọn, thực hiện có backup và được mô tả ở phần đầu; các kiểm tra giao diện storefront thật chỉ đọc.
- Chưa chạy load test, Safari/Firefox hoặc mọi kích thước màn hình.
- Mongoose còn cảnh báo deprecated với tùy chọn `new` ở một số truy vấn cũ; các truy vấn vẫn hoạt động và toàn bộ test đã đạt.
- Access token tiếp tục được giữ trong bộ nhớ như thiết kế hiện tại: tải lại trang yêu cầu đăng nhập lại.

Test hồi quy mới: `server/tests/catalog-cart-regressions.test.ts`, `server/tests/database-startup.test.ts`, `client/e2e/regressions.spec.ts`, `client/e2e/visual.spec.ts`, `client/e2e/product-media.spec.ts`; kiểm tra API frontend được mở rộng trong `client/src/api.test.ts`. Bộ `client/visual-qa/` dành riêng cho kiểm tra/chụp storefront đang chạy, không được chạy mặc định với E2E demo.
