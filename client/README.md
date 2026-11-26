# CommerceHub frontend

## Khám phá danh mục và thương hiệu

- `/collections`: danh mục đang công khai, ảnh lấy từ một sản phẩm trong nhóm và số lượng lấy từ API; danh mục chưa có hàng dùng biểu tượng.
- `/collections/:slug`: trang riêng theo slug danh mục, giữ đúng nhóm khi lọc giá, thương hiệu, tồn kho và phân trang.
- `/brands`: thương hiệu lấy từ `/products/facets`, không tự tạo hãng hoặc logo.
- `/brands/:brand`: trang riêng giữ đúng thương hiệu khi lọc và tải lại.
- Menu danh mục nằm dưới thanh đầu trang, dùng được bằng bàn phím và trên điện thoại. Trang chủ có khu khám phá dẫn đến các trang nhóm.

Quản lý dữ liệu qua **Quản trị → Danh mục / Thiết bị** như trước. Nhập tên và mô tả danh mục; backend tự sinh slug từ tên khi tạo mới, giữ nguyên đường dẫn khi đổi tên. Thương hiệu ở sản phẩm. Không cần thêm route thủ công cho từng nhóm hoặc hãng. Trang không còn tồn tại có liên kết quay lại danh sách.

Các màn hình quản trị có **Xuất Excel** theo trang hoặc toàn bộ kết quả lọc. Sản phẩm, danh mục và nhân viên hỗ trợ **Nhập Excel**; Lịch sử kho hỗ trợ nhập tăng/giảm có lý do. Có file mẫu, xem trước, báo lỗi và xác nhận trước khi ghi. Xem [Hướng dẫn Excel](../EXCEL-GUIDE.md).

Mã nguồn: `src/Discovery.tsx`, `src/discovery.css`; bộ lọc dùng lại `Catalog` trong `src/Store.tsx`. Kiểm tra luồng mới bằng `npx playwright test e2e/discovery.spec.ts`. Dữ liệu thương hiệu có chữ “Demo” chỉ dùng trong database demo tạm, không ghi vào database cửa hàng.

React + TypeScript + Vite, React Router, TanStack Query. Triển khai trên nhánh `frontend/full-implementation`; nhánh `frontend/custom-design` giữ bản backend nền để tự thiết kế độc lập.

## Chạy với backend của bạn

Từ root repo, mở hai terminal:

```powershell
cd server
npm install
# Cấu hình .env theo .env.example: MongoDB replica set và JWT secret >=32 byte.
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Frontend: http://127.0.0.1:5173. Vite chuyển `/api` tới backend cổng 5000. Địa chỉ proxy khác có thể đặt bằng biến môi trường `API_TARGET` trước khi chạy Vite. Nếu gọi API khác origin trực tiếp, đặt `VITE_API_URL=https://api.example/api` và cấu hình `CORS_ORIGINS` của server chính xác.

## Bản trải nghiệm với database tạm

Không cần dùng database hiện có. Dữ liệu mẫu chỉ tồn tại trong MongoDB replica set tạm, mất khi dừng tiến trình. Bản demo bind localhost, từ chối chạy khi NODE_ENV=production và không đọc MONGODB_URI.

```powershell
# Terminal 1, từ root
cd server
npm run dev:demo
```

```powershell
# Terminal 2, từ root
cd client
$env:API_TARGET='http://127.0.0.1:5001'
npm run dev
```

Tài khoản mẫu: `customer@demo.local`, `staff@demo.local`, `admin@demo.local`. Mật khẩu chung `DemoCommerce!2026`. Chỉ dành cho database tạm; không phải tài khoản ứng dụng thật. Sản phẩm, giá, tồn kho và ảnh trong bản demo là dữ liệu minh họa, cần thay bằng dữ liệu cửa hàng khi dùng thực tế.

## Phạm vi giao diện

- Cửa hàng: trang chủ, danh mục, tìm kiếm, lọc giá, sắp xếp, phân trang, chi tiết, tồn kho, danh sách và điểm đánh giá.
- Khách hàng: đăng ký/đăng nhập, giỏ hàng, địa chỉ thêm/sửa/xóa/mặc định, đặt hàng COD kèm mã giảm giá và idempotency key, đơn hàng/hủy, trạng thái thanh toán, hành trình vận chuyển, viết/sửa/xóa đánh giá.
- STAFF/ADMIN: thiết bị thêm/sửa/ẩn/khôi phục và điều chỉnh tồn, danh mục, xác nhận/hủy đơn, tạo/cập nhật vận đơn theo trạng thái hợp lệ, xác nhận thu COD, kiểm duyệt đánh giá, tạo/bật/tắt coupon, xuất trang hiện tại CSV.
- ADMIN: dashboard doanh thu, lọc khoảng ngày, bảng dữ liệu biểu đồ, tồn thấp và sản phẩm bán chạy. STAFF không được truy cập dashboard.
- Loading, empty, error/retry, thông báo thao tác, keyboard focus, dialog có nhãn và khóa cuộn nền; responsive được kiểm tra ở 320, 390, 768 và 1280px.

Chi tiết sản phẩm có thông số, bộ ảnh, ảnh phóng to và phiên bản SKU. Quản trị nhập dữ liệu thật hoặc tải ảnh PNG/JPEG/WebP tối đa 5 MB; đường dẫn HTTPS, `/images/*` và `/api/media/*` hợp lệ được hỗ trợ. Thiếu dữ liệu sẽ hiển thị chưa cập nhật. Xem [chức năng bổ sung và cấu hình](../COMPLETENESS.md).

## Thiết kế và tùy chỉnh

Banner trang chủ dùng `src/HeroSpotlight.tsx` và `src/banner-motion.css`. Tối đa 4 sản phẩm thực tế lấy từ danh sách nổi bật; tự đổi ảnh mỗi **4,5 giây** (`DURATION` trong component). Ảnh, tên và liên kết chi tiết luôn lấy từ cùng một sản phẩm. Khi chưa có dữ liệu, chỉ hiển thị ảnh giới thiệu có nhãn và dẫn đến danh sách thiết bị.

Banner dùng chuyển mờ giữa ảnh trên nền sáng, không có orbit, nhãn nổi hoặc parallax. Nút trước/sau xuất hiện khi rê chuột hoặc dùng bàn phím trên desktop; có chấm chọn ảnh, không có nút tạm dừng theo yêu cầu người dùng. Rê chuột không chặn tự chạy. Chọn ảnh thủ công bắt đầu lại chu kỳ 4,5 giây. Focus trên liên kết tạm ngưng để đích bấm ổn định và tự tiếp tục khi rời focus. Banner ngoài khung nhìn hoặc tab nền cũng tạm ngưng.

Theo yêu cầu tự chạy của người dùng, `prefers-reduced-motion` chỉ rút ngắn hiệu ứng chuyển mờ; banner vẫn luân phiên ảnh và không hiển thị trạng thái/nút “Giảm chuyển động”. Không thay đổi cài đặt Windows. Phần chữ chính giữ nguyên.

Giao diện theo hướng **sáng, tối giản, ảnh lớn** do người dùng chọn. Toàn bộ banner nằm trong khung bo góc rộng tối đa 1480px có lề hai bên, thay cho nền kéo hết trang. Trên desktop khoảng 25% dành cho chữ và 75% cho ảnh; ảnh bỏ padding và có vùng hiển thị lớn hơn. Tiêu đề tối đa 36px trên desktop, 28px trên điện thoại. Khối chữ chỉ gồm lời giới thiệu ngắn và một nút xem thiết bị; bỏ các cam kết chưa xác nhận, nhãn nổi và danh mục lặp trong banner. Tên thiết bị nằm dưới ảnh; giá nằm trong lưới sản phẩm. Tỷ lệ tĩnh của ảnh ASUS có lề trong được giữ cả khi bật giảm chuyển động. Các kiểu tỷ lệ này nằm ở `src/banner-motion.css`, tải sau các stylesheet khác.

Trang chủ lấy tối đa 24 sản phẩm, hiển thị tối đa 8 mẫu từ nhiều danh mục và ưu tiên hàng còn trong danh sách đã tải. Số lượng phụ thuộc dữ liệu thật. Thẻ sản phẩm có một vùng ảnh, tên/giá/trạng thái cùng trục; lưới trang chủ chuyển từ 4 sang 2 cột ở độ rộng 1100px trở xuống. Header desktop một hàng; màn hình từ 1360px trở xuống dùng menu mở khi cần và luôn giữ ô tìm kiếm. Nút mũi tên có vùng bấm 44px; header/footer dùng logo chữ.

Màu xanh dương dùng cho nút chính, liên kết và tiêu đề nhấn; màu cam ấm dùng cho giá và chi tiết thương hiệu. Hero nền xanh nhạt, ảnh sản phẩm có nền màu nhẹ; footer xanh navy với chữ sáng. Màu đỏ/xanh/vàng nghiệp vụ tiếp tục theo trạng thái. Thẻ sản phẩm có hiệu ứng hover nhẹ và tắt chuyển động khi người dùng bật giảm chuyển động. Biến/thành phần chung nằm ở `src/ui.css`; phần giao diện cửa hàng và các biến riêng nằm trong `src/storefront.css`, được tải sau cùng. Catalogue điện thoại có bộ lọc mở/đóng, đếm điều kiện đang dùng và nút xóa nhanh; mức giá hỗ trợ đến 10/20/40 triệu.

Phông **Be Vietnam Pro** đóng gói qua `@fontsource/be-vietnam-pro` (400/500/600/700), hỗ trợ tiếng Việt và không gọi Google Fonts khi mở trang. Nội dung chính dùng 16–18px trên desktop, điều chỉnh theo kích thước màn hình; nhãn trạng thái tối thiểu 13px; ô nhập trên điện thoại dùng 16px. Mã định danh ở khu vực quản trị dùng monospace hệ thống. `src/typography-motion.css` chỉnh độ rõ chữ, khoảng dòng và chuyển động. `src/usePageMotion.ts` tạo hiệu ứng nội dung xuất hiện khi cuộn và dọn animation khi đổi trang; chữ không giữ transform sau hiệu ứng. `prefers-reduced-motion` tắt chuyển động kể cả khi tùy chọn thay đổi trong lúc mở trang.

Nếu chữ vẫn răng cưa trên Windows, kiểm tra **Adjust ClearType text** và **Smooth edges of screen fonts**. Lần kiểm tra ngày 07/11/2026 ghi nhận `HKCU\Control Panel\Desktop\FontSmoothing = 0` trên máy đang chạy; đây là cài đặt hệ thống, không phải thuộc tính CSS. Có thể mở bộ chỉnh ClearType bằng `Win + R` → `cttune`. Phần sửa web không thay đổi cài đặt Windows.

- `src/styles.css`: bố cục, breakpoint, typography.
- `src/ui.css`: bảng màu và kiểu thành phần dùng chung, tải sau `styles.css`.
- `src/Home.tsx`, `src/storefront.css`: bố cục trang chủ, ảnh tiêu điểm, thẻ sản phẩm, catalogue và giao diện cửa hàng; `completeness.css` bổ sung kiểu cho các màn hình nghiệp vụ mới sau `storefront.css`.
- `src/Store.tsx`: catalogue và chi tiết sản phẩm.
- `src/product-media.ts`: chọn ảnh minh họa có ghi nhãn khi thiếu ảnh thật; không cập nhật database.
- `src/Account.tsx`, `src/ReviewEditor.tsx`: mua hàng và tài khoản.
- `src/Admin.tsx`: công cụ vận hành.
- `src/api.ts`: HTTP, Bearer token, chuẩn hóa response các module.
- `public/images`: ảnh nằm trong repo; nguồn và prompt trong ASSETS.md.

Quản trị sản phẩm có preview URL ảnh, thumbnail, nhãn/bộ lọc “Chưa có ảnh”. Cần nhập ảnh đúng model/SKU và lưu để có ảnh sản phẩm thật; ảnh minh họa laptop/CPU chỉ là cách hiển thị tạm khi trường `imageUrl` trống. Đã có API tải ảnh từ máy, chỉ STAFF/ADMIN sử dụng.

Bốn sản phẩm thật đã được chuẩn hóa tên model và gắn ảnh web theo lựa chọn được người dùng giao. Ảnh ASUS lấy từ trang hãng; CPU i5-14600K lấy từ listing Newegg đúng mã và đối chiếu Intel. Nguồn tại [ASSETS.md](ASSETS.md). Giá, tồn kho, SKU và danh mục giữ nguyên; dữ liệu trước thay đổi được sao lưu trong `.local/product-photo-backups/` tại root.

Không thể bảo đảm một bố cục không giống bất kỳ website nào. Tính riêng đến từ hệ thống quyết định thị giác nhất quán và cách phục vụ nghiệp vụ của CommerceHub. Bước tùy chỉnh tiếp theo là ảnh hàng hóa thật, ngôn ngữ thương hiệu và thông số sản phẩm do cửa hàng xác nhận.

## Kiểm tra

```powershell
npm run build
npm test
npm run test:e2e
```

E2E tự chạy API demo + MongoDB tạm + Vite preview cổng 4173, thực hiện các thao tác qua trình duyệt với API thật và dừng các server sau kiểm tra. Chạy `npm run build` trước E2E. Cấu hình mặc định Edge trên Windows; có thể đặt `BROWSER_EXECUTABLE` theo đường dẫn Chrome/Chromium trên máy khác. Screenshot ở `qa/`; trace và failure screenshot ở `test-results/` (gitignore).

Để chụp storefront đang chạy cổng 5173 với dữ liệu hiện tại, chạy `npx playwright test --config playwright.live.config.ts`. Kiểm tra này chỉ đọc, không đăng nhập hay ghi database; ảnh lưu tại `qa/redesign/`.

## Giới hạn triển khai

Access token chỉ giữ trong bộ nhớ, không lưu localStorage/sessionStorage. Refresh cookie HttpOnly có xoay vòng giúp khôi phục đăng nhập khi tải lại trang. Đổi/reset mật khẩu thu hồi phiên cũ. Checkout lấy báo giá gồm coupon/phí giao hàng trước khi đặt và kiểm tra tổng khách đã xác nhận. API quyết định phân quyền, giá, giảm giá và tồn kho. Idempotency key giữ nguyên cho retry cùng payload. Email hiện tắt theo lựa chọn người dùng; hướng dẫn kết nối và giới hạn tích hợp tại [COMPLETENESS.md](../COMPLETENESS.md).

Phông có font hệ thống dự phòng khi asset chưa tải. HTTPS, SPA fallback về index.html và proxy `/api` cần cấu hình trên hosting thực tế; Vite proxy chỉ dành cho dev/preview. Chưa triển khai hosting trong đợt này. Chưa kiểm tra screen reader chuyên dụng, load test hay mọi tổ hợp browser/thiết bị. Các thông báo lỗi nghiệp vụ của API có thể còn tiếng Anh.
