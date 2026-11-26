# Hướng dẫn tự vận hành và sửa CommerceHub

Cập nhật theo mã nguồn ngày **06/11/2026**. Thư mục dự án trên máy: `D:\CommerceHub`.

Tài liệu này giúp bạn làm hai việc: điều hành cửa hàng bằng trang quản trị và tìm đúng file khi muốn sửa website. Những phần chưa tích hợp được ghi rõ, không coi cấu hình mẫu là dịch vụ đang chạy thật.

## 1. Bắt đầu từ đâu?

| Bạn muốn làm gì? | Đi đâu trước? |
| --- | --- |
| Chạy website trên máy | Mục [3. Chạy và dừng website](#3-chạy-và-dừng-website) |
| Đăng sản phẩm, sửa giá, nhập tồn | Trên web: **Quản trị → Thiết bị** |
| Xử lý đơn mua hàng | Trên web: **Quản trị → Đơn hàng → Vận chuyển → Thanh toán** |
| Tạo/khóa nhân viên | Trên web: **Quản trị → Tài khoản**; xem [hướng dẫn nhân viên](STAFF-MANAGEMENT.md) |
| Tạo, thay thế, khóa hoặc xóa ADMIN | Xem [hướng dẫn bảo trì tài khoản admin](HUONG-DAN-TAO-VA-XOA-ADMIN.md); hiện chưa có công cụ này trên web |
| Sửa liên hệ, chính sách, phí giao hàng | Trên web: **Quản trị → Cửa hàng** |
| Sửa chữ, ảnh giới thiệu, bố cục trang chủ | [client/src/Home.tsx](client/src/Home.tsx) và [client/src/storefront.css](client/src/storefront.css) |
| Sửa logo chữ, menu, footer hoặc đường dẫn trang | [client/src/App.tsx](client/src/App.tsx) |
| Hiểu file nào phụ trách phần nào | Mục [5. Bản đồ frontend](#5-bản-đồ-frontend) và [6. Bản đồ backend](#6-bản-đồ-backend) |
| Đổi kết nối database/email/cổng chạy | Mục [8. Cấu hình](#8-cấu-hình) |
| Website lỗi hoặc sửa code chưa thấy hiệu lực | Mục [9. Tìm lỗi](#9-tìm-lỗi) |

**Quản lý dữ liệu cửa hàng thì dùng trang quản trị. Sửa cách website hiển thị hoặc xử lý nghiệp vụ thì mới sửa code.** Ví dụ: thay giá một laptop bằng nút Sửa sản phẩm; thay màu giá tiền bằng CSS.

## 2. Hiểu cấu trúc dự án trong vài phút

```text
D:\CommerceHub
├── client/                  Giao diện React mà khách/nhân viên nhìn thấy
│   ├── src/                 Mã nguồn giao diện, biểu mẫu, gọi API, CSS
│   ├── public/images/       Ảnh tĩnh có sẵn trong dự án
│   ├── e2e/                 Kiểm thử luồng bằng trình duyệt
│   ├── vite.config.ts       Cổng frontend và chuyển tiếp /api sang backend
│   └── package.json         Lệnh chạy/build/test của frontend
├── server/                  API Express và nghiệp vụ
│   ├── src/index.ts         Khởi động backend, kết nối MongoDB
│   ├── src/app.ts           Gắn các đường dẫn API và middleware
│   ├── src/modules/         Sản phẩm, tài khoản, đơn hàng, thanh toán...
│   ├── src/middlewares/     Xác thực, phân quyền, giới hạn truy cập, xử lý lỗi
│   ├── tests/               Kiểm thử backend
│   ├── .env                 Cấu hình thật trên máy; không đưa lên Git
│   ├── .env.example         Mẫu tên biến cấu hình; không chứa khóa thật
│   └── var/uploads/         Ảnh tải lên nếu dùng đường dẫn mặc định
└── Các file .md             Tài liệu sử dụng, vận hành và kiểm chứng
```

Dữ liệu sản phẩm, tài khoản, giá, tồn kho, đơn hàng nằm trong **MongoDB**, không nằm trong `Home.tsx` hay file Excel. Ảnh có thể là file tĩnh trong `client/public/images`, file upload trên server hoặc URL HTTPS.

Trong VS Code:

- Nhấn **Ctrl + P**, nhập ví dụ `client/src/Home.tsx` để mở file nhanh.
- Nhấn **Ctrl + Shift + F** để tìm một câu đang xuất hiện trên web trong toàn dự án.
- Nhấn **Ctrl + S** để lưu file. Khi chạy chế độ `dev`, trình duyệt thường cập nhật tự động.
- `node_modules/` là thư viện đã cài; `dist/` là kết quả build. Hãy sửa trong `src/`, không sửa trực tiếp hai thư mục này.
- `.local/` chứa các công cụ/ảnh kiểm tra tạm của quá trình phát triển, không phải nơi điều hành cửa hàng thường ngày.

## 3. Chạy và dừng website

### 3.1. Mở hai terminal trong VS Code

Mở thư mục `D:\CommerceHub` bằng **File → Open Folder**. Chọn **Terminal → New Terminal** để mở terminal thứ nhất; bấm dấu **+** trong khu vực terminal để mở terminal thứ hai. Có thể bấm nút **Split Terminal** để xem hai cửa sổ cạnh nhau.

Terminal backend:

```powershell
Set-Location D:\CommerceHub\server
npm run dev
```

Terminal frontend:

```powershell
Set-Location D:\CommerceHub\client
npm run dev
```

Nếu máy chưa cài các dependency hoặc vừa thay đổi `package.json`/lockfile, chạy `npm install` trong từng thư mục tương ứng trước. Không cần cài lại mỗi lần mở web.

| Thành phần | Địa chỉ mặc định | Dùng để làm gì? |
| --- | --- | --- |
| Frontend | http://127.0.0.1:5173 | Mở website và đăng nhập |
| Quản trị | http://127.0.0.1:5173/admin | Công cụ điều hành sau khi đăng nhập đúng quyền |
| Backend health | http://127.0.0.1:5000/health | Kiểm tra backend có phản hồi hay không |

Backend cần `server/.env` đúng và MongoDB đang hoạt động. Các nghiệp vụ có transaction cần MongoDB **replica set**; chỉ mở frontend sẽ không có dữ liệu/đăng nhập thật.

Giữ hai terminal đang chạy khi sử dụng. Để dừng, chọn từng terminal và nhấn **Ctrl + C**. Để chạy lại, dùng lại lệnh `npm run dev` trong đúng thư mục.

### 3.2. Muốn tập thao tác mà không đụng dữ liệu thật

Dùng bản demo riêng. Các lệnh và tài khoản mẫu nằm trong [client/README.md](client/README.md), mục **Bản trải nghiệm với database tạm**. Demo dùng backend cổng 5001 và database tạm; dữ liệu mất khi dừng tiến trình. Tài khoản demo chỉ tồn tại trong môi trường demo.

Khi chuyển từ demo về backend thật, kiểm tra terminal frontend có đang giữ biến `API_TARGET` trỏ tới cổng 5001 hay không. Nếu có, mở terminal mới hoặc bỏ biến trước khi chạy lại:

```powershell
Remove-Item Env:API_TARGET -ErrorAction SilentlyContinue
```

Lệnh trên chỉ bỏ biến môi trường trong terminal hiện tại, không xóa dữ liệu hay file dự án.

## 4. Điều hành cửa hàng trên web

### 4.1. Tài khoản và nhân viên

Đăng nhập bằng tài khoản ADMIN của cửa hàng, vào `/admin`. Tài khoản được lưu trong MongoDB; không có file chứa mật khẩu gốc để đọc lại.

Tạo nhân viên: **Tài khoản → Thêm nhân viên** → nhập thông tin và mật khẩu admin → lưu mật khẩu tạm để chuyển riêng cho nhân viên. Mật khẩu tạm có hạn 24 giờ. Nhân viên phải đổi mật khẩu trước khi làm việc. Quên/hết hạn thì dùng **Cấp lại mật khẩu tạm**; nghỉ việc thì **Khóa**. Chi tiết tại [STAFF-MANAGEMENT.md](STAFF-MANAGEMENT.md).

Khách hàng tự đăng ký luôn nhận quyền CUSTOMER. STAFF không được quản lý tài khoản hay cấu hình cửa hàng. ADMIN không thể tự khóa chính mình hoặc cấp ADMIN qua màn hình tạo nhân viên. Hiện chưa có giao diện tạo ADMIN đầu tiên; khi quên mật khẩu admin và email chưa kết nối, chưa có quy trình tự khôi phục hoàn chỉnh qua giao diện.

Admin/nhân viên mở **Tài khoản** ở header để tự sửa hồ sơ, đổi mật khẩu và thu hồi phiên đăng nhập. Mật khẩu mới STAFF/ADMIN tối thiểu 12 ký tự.

### 4.2. Danh mục và sản phẩm

1. **Danh mục → Thêm mới**: nhập tên, slug và mô tả. Slug ví dụ `laptop-gaming` là tên ngắn dùng trong hệ thống.
2. **Thiết bị → Thêm mới**: nhập tên, SKU duy nhất, giá VND, danh mục, ảnh và mô tả.
3. Nhập model/thương hiệu, thông số đúng SKU, bảo hành và phụ kiện nếu đã xác nhận được. Chưa rõ thì để trống để web hiện chưa cập nhật.
4. Thông số nhập mỗi dòng dạng `Tên: Giá trị`, ví dụ `RAM: 16 GB`. Bộ ảnh bổ sung nhập mỗi dòng một URL.
5. Có thể tải ảnh từ máy tại trường ảnh sản phẩm: PNG/JPEG/WebP tối đa 5 MB. Xem trước rồi lưu.
6. Sau khi thêm sản phẩm, dùng nút **Tồn kho**, nhập phần tăng/giảm và lý do. Ví dụ đang có 5, nhập thêm 3 thì điền `3`; xuất bớt 2 thì điền `-2`.

Để sửa giá dùng **Thiết bị → Sửa → Giá bán**. Để ngừng bán dùng **Ẩn**, không cần xóa dữ liệu. Danh mục bị ẩn cũng làm sản phẩm thuộc danh mục đó không xuất hiện công khai. Sản phẩm có tồn 0 vẫn có thể hiển thị với nhãn hết hàng.

Phiên bản cùng dòng được nối bằng `Mã nhóm các SKU cùng dòng`: các SKU thực sự liên quan dùng chung mã nhóm; mỗi SKU có tên phiên bản riêng. Ví dụ cùng dòng máy nhưng hai cấu hình RAM/SSD khác nhau vẫn là hai SKU với giá/tồn riêng.

### 4.3. Từ đơn hàng đến nhận tiền

1. **Đơn hàng**: xem sản phẩm, số lượng, người nhận, địa chỉ và tổng tiền; xác nhận đơn phù hợp.
2. **Vận chuyển → Thêm mới**: điền ID đơn đã xác nhận, đơn vị vận chuyển và mã vận đơn thực tế. Có thể lấy ID đầy đủ từ bảng đơn hàng.
3. Cập nhật theo tiến trình giao nhận thực tế: **Chờ lấy hàng → Đã lấy hàng → Đang trung chuyển → Đang giao → Đã giao**.
4. Nếu giao thất bại/hoàn hàng, chọn trạng thái hợp lệ tiếp theo và ghi lý do. Không tự nhảy trạng thái để làm báo cáo đẹp hơn.
5. **Thanh toán → Xác nhận thu**: chỉ xác nhận COD khi đơn đã giao và cửa hàng đã thực sự đối soát nhận tiền. Dashboard doanh thu dựa trên thanh toán PAID, không chỉ trạng thái đã giao.

**Phân biệt hai loại phí:** phí khách phải trả được cấu hình tại **Cửa hàng** và lưu vào tổng đơn; trường **Chi phí vận chuyển nội bộ** khi tạo vận đơn là chi phí cửa hàng theo dõi, không tự cộng thêm vào đơn khách đã chấp nhận.

Khách chỉ hủy đơn chờ xác nhận; nhân viên/admin có thể hủy đơn chờ hoặc đã xác nhận theo quy tắc hệ thống. Hủy trước khi giao trả lại tồn và lượt coupon trong transaction. Khi hàng đã giao cho đơn vị vận chuyển thì dùng quy trình giao/hoàn phù hợp. Hàng hoàn không tự nhập tồn lại; kiểm tra thực tế rồi điều chỉnh kho với lý do.

### 4.4. Chính sách, coupon và hỗ trợ sau mua

| Mục quản trị | Bạn làm gì ở đây? |
| --- | --- |
| Cửa hàng | Điền liên hệ/giờ làm việc và chính sách giao hàng, đổi trả, bảo hành, riêng tư, điều khoản |
| Cửa hàng → Phí giao hàng | Bật trạng thái đã công bố chính sách phí, nhập phí cố định và ngưỡng miễn phí nếu có. Ngưỡng tính trên tiền hàng sau giảm giá |
| Mã giảm giá | Tạo mã với loại giảm tiền/phần trăm, giá trị, đơn tối thiểu, số lượt và thời hạn; bật/tắt mã. Hiện chưa có giao diện sửa toàn bộ điều kiện mã đã tạo |
| Đổi trả / Bảo hành | Xem yêu cầu từ đơn đã giao, duyệt/từ chối và phản hồi tiến trình. Đánh dấu giải quyết không tự chuyển tiền hay nhập lại kho |
| Đánh giá | Ẩn/hiện đánh giá theo quyền và quy tắc hiện có |
| Lịch sử kho | Kiểm tra số lượng trước/sau, người thực hiện, lý do và đơn liên quan |
| Nhật ký quản trị | Tra người thực hiện, thời gian, thao tác quan trọng và thay đổi trước/sau; chỉ ADMIN được xem |

Nếu chính sách phí chưa cấu hình, hệ thống hiện tính 0 ₫ và ghi rõ chưa cập nhật. Hãy nhập thông tin thực tế trước khi dùng cho đơn bán thật. Phạm vi chi tiết của nhật ký nằm trong [STAFF-MANAGEMENT.md](STAFF-MANAGEMENT.md); không phải mọi thao tác sửa database trực tiếp đều có nhật ký.

## 5. Bản đồ frontend

Các đường dẫn dưới đây đều tính từ `D:\CommerceHub`. Bạn có thể bấm liên kết hoặc dùng Ctrl + P trong VS Code.

| File | Chức năng | Mở khi muốn sửa |
| --- | --- | --- |
| [main.tsx](client/src/main.tsx) | Khởi động React, đăng ký router, session, cache dữ liệu và thứ tự CSS | Cấu trúc khởi tạo ứng dụng |
| [App.tsx](client/src/App.tsx) | Header, logo chữ, menu, footer, các đường dẫn trang và gate khách hàng | Menu/logo/footer, thêm đường dẫn trang |
| [Home.tsx](client/src/Home.tsx) | Nội dung trang chủ, phần ảnh tiêu điểm, danh mục nhanh và lưới nổi bật | Câu giới thiệu, nút trang chủ, chọn sản phẩm tiêu điểm |
| [Store.tsx](client/src/Store.tsx) | Catalogue, bộ lọc, trang chi tiết chính và trang câu chuyện | Bộ lọc, cách mua ở trang chi tiết, nội dung câu chuyện |
| [ProductDetails.tsx](client/src/ProductDetails.tsx) | Bộ ảnh/phóng to, thông số, phiên bản, sản phẩm liên quan, metadata sản phẩm | Cách trình bày thông số/ảnh/phiên bản |
| [Account.tsx](client/src/Account.tsx) | Đăng nhập/đăng ký, tài khoản, địa chỉ, giỏ, checkout, chi tiết đơn | Các màn hình mua hàng và theo dõi đơn |
| [AccountExtras.tsx](client/src/AccountExtras.tsx) | Quên/reset/xác minh email, hồ sơ, đổi mật khẩu/email, thiết bị đăng nhập | Biểu mẫu bảo mật tài khoản |
| [StaffOnboarding.tsx](client/src/StaffOnboarding.tsx) | Chuyển người cần đổi mật khẩu tới trang thiết lập bắt buộc | Màn hình nhân viên đăng nhập lần đầu |
| [CustomerServices.tsx](client/src/CustomerServices.tsx) | Khách gửi yêu cầu sau mua và đọc thông báo | Giao diện bảo hành/đổi trả/thông báo |
| [Admin.tsx](client/src/Admin.tsx) | Khung quản trị, menu, dashboard và bảng sản phẩm/đơn/vận chuyển/thanh toán... | Biểu mẫu thêm/sửa sản phẩm và các bảng vận hành chính |
| [AdminStaff.tsx](client/src/AdminStaff.tsx) | Danh sách tài khoản, tạo nhân viên, cấp lại mật khẩu, nhật ký | Quản lý nhân viên và màn hình audit |
| [AdminOperations.tsx](client/src/AdminOperations.tsx) | Chọn màn hình tài khoản/cửa hàng; biểu mẫu cấu hình cửa hàng | Biểu mẫu chính sách, liên hệ, phí giao hàng |
| [AdminWorkflow.tsx](client/src/AdminWorkflow.tsx) | Quản lý yêu cầu sau mua và xem sổ kho | Giao diện xử lý hỗ trợ/kho |
| [StorePages.tsx](client/src/StorePages.tsx) | Trang liên hệ và các trang chính sách công khai | Cách hiển thị liên hệ/chính sách; nội dung thật sửa trên quản trị |
| [ReviewEditor.tsx](client/src/ReviewEditor.tsx) | Khách chỉnh sửa đánh giá của mình | Biểu mẫu sửa đánh giá |
| [components.tsx](client/src/components.tsx) | Nút/thẻ ảnh sản phẩm, dialog, loading/error/empty, badge, phân trang | Thành phần dùng chung ở nhiều trang |
| [context.tsx](client/src/context.tsx) | Trạng thái đăng nhập, login/logout, khôi phục phiên, thông báo | Hành vi giữ/đổi tài khoản và đăng xuất |
| [api.ts](client/src/api.ts) | Gọi backend, Bearer token, refresh, xử lý lỗi, upload, định dạng tiền/ngày | Kết nối frontend–backend hoặc nhãn trạng thái |
| [types.ts](client/src/types.ts) | Kiểu dữ liệu TypeScript của sản phẩm, đơn, người dùng... | Thêm trường dữ liệu được frontend sử dụng |
| [product-media.ts](client/src/product-media.ts) | Chọn ảnh minh họa có ghi nhãn khi thiếu ảnh thật | Quy tắc ảnh dự phòng |

### CSS: sửa ở file nào để tránh sửa nhầm?

Thứ tự tải thực tế trong `main.tsx`:

```text
styles.css → ui.css → storefront.css → completeness.css
```

Nếu hai quy tắc có cùng độ ưu tiên, quy tắc tải sau sẽ thắng. Selector cụ thể hơn và các điều kiện màn hình cũng ảnh hưởng kết quả.

| File | Vai trò hiện tại |
| --- | --- |
| [styles.css](client/src/styles.css) | Bố cục nền, breakpoint, font Be Vietnam Pro và nhiều kiểu gốc |
| [typography-motion.css](client/src/typography-motion.css) | Độ rõ chữ, khoảng dòng, hiệu ứng menu, ảnh và thông báo |
| [header-cart.css](client/src/header-cart.css) | Biểu tượng xe đẩy, nhãn Giỏ hàng và số lượng trên thanh đầu trang |
| [HeroSpotlight.tsx](client/src/HeroSpotlight.tsx) | Banner tự đổi ảnh mỗi 4,5 giây; chọn ảnh và tự tiếp tục sau khi rời focus; không có nút tạm dừng |
| [banner-motion.css](client/src/banner-motion.css) | Chuyển mờ ảnh banner, chấm chọn ảnh và nút điều khiển gọn |
| [usePageMotion.ts](client/src/usePageMotion.ts) | Chuyển động khi đổi trang/cuộn, tôn trọng tùy chọn giảm chuyển động |
| [ui.css](client/src/ui.css) | Kiểu chung cho nút, input, bảng, trạng thái và dialog |
| [storefront.css](client/src/storefront.css) | Bảng màu xanh/cam đang dùng, header/footer, trang chủ, thẻ sản phẩm/catalogue |
| [completeness.css](client/src/completeness.css) | Các phần mở rộng: hồ sơ, gallery, chính sách, nhân viên, onboarding, audit |

Màu xanh chính hiện được đặt bằng `--primary` trong `storefront.css`; màu giá/nhấn ấm dùng `--brand-accent`. Hãy xem các biến tại `:root` ở đầu file này trước khi sửa màu. Sửa biến trong `ui.css` có thể không thấy hiệu lực vì bị `storefront.css` ghi đè.

## 6. Bản đồ backend

Trong một module thông thường:

| Loại file | Hiểu đơn giản |
| --- | --- |
| `*.router.ts` | Địa chỉ API nào tồn tại, GET/POST/PATCH/DELETE và ai được gọi |
| `*.controller.ts` | Nhận request, kiểm tra đầu vào cơ bản, gọi nghiệp vụ và trả response |
| `*.service.ts` | Xử lý nghiệp vụ: điều kiện chuyển trạng thái, tiền, tồn kho, transaction... |
| `*.model.ts` | Cấu trúc document MongoDB, trường dữ liệu, quan hệ và index |
| `*.types.ts`, `*.rules.ts`, parser | Kiểu dữ liệu, danh sách trạng thái và quy tắc kiểm tra riêng |

Một số module nhỏ gộp xử lý ngay trong router; không phải module nào cũng có đủ các loại file trên.

| Phần | Vị trí cần mở |
| --- | --- |
| Khởi động server/cổng/JWT secret | [server/src/index.ts](server/src/index.ts) |
| Danh sách nhóm API và gắn middleware | [server/src/app.ts](server/src/app.ts) |
| Kết nối MongoDB, khởi tạo index | [server/src/config/database.ts](server/src/config/database.ts) |
| Ai đang đăng nhập; thu hồi phiên; bắt đổi mật khẩu | [auth.middleware.ts](server/src/middlewares/auth.middleware.ts) |
| Cho phép vai trò nào gọi API | [authorize.middleware.ts](server/src/middlewares/authorize.middleware.ts) và router tương ứng |
| CORS, security header, giới hạn số request | [security.middleware.ts](server/src/middlewares/security.middleware.ts) |
| Cách trả lỗi chung | [error.middleware.ts](server/src/middlewares/error.middleware.ts) |
| Cấu trúc tài khoản và vai trò | [user.model.ts](server/src/modules/auth/user.model.ts) |
| Đăng ký/kiểm tra mật khẩu đăng nhập | [auth.service.ts](server/src/modules/auth/auth.service.ts), [auth.controller.ts](server/src/modules/auth/auth.controller.ts) |
| Các đường dẫn tài khoản | [auth.router.ts](server/src/modules/auth/auth.router.ts) |
| Refresh, hồ sơ, đổi/reset mật khẩu/email, phiên đăng nhập | [account.service.ts](server/src/modules/auth/account.service.ts) |
| Session và token xác minh/khôi phục lưu ở đâu | [account.models.ts](server/src/modules/auth/account.models.ts) |
| Tạo/cấp lại mật khẩu nhân viên, khóa/đổi quyền | [staff-admin.router.ts](server/src/modules/auth/staff-admin.router.ts); `admin-user.router.ts` chỉ chuyển tiếp export |
| Gửi email qua provider | [mail.service.ts](server/src/modules/auth/mail.service.ts) |
| Sản phẩm, giá, tồn, ẩn/khôi phục | [product.controller.ts](server/src/modules/products/product.controller.ts), [product.service.ts](server/src/modules/products/product.service.ts), [product.model.ts](server/src/modules/products/product.model.ts) |
| Kiểm tra thông số/bộ ảnh, lọc sản phẩm | [product-details.ts](server/src/modules/products/product-details.ts), [product-query.parser.ts](server/src/modules/products/product-query.parser.ts) |
| Upload file ảnh | [media.router.ts](server/src/modules/products/media.router.ts) |
| Giỏ hàng | `server/src/modules/cart/` |
| Địa chỉ | `server/src/modules/addresses/` |
| Danh mục | `server/src/modules/categories/` |
| Tạo/hủy/xác nhận đơn; giữ/trả tồn; coupon | [order.service.ts](server/src/modules/orders/order.service.ts) |
| Báo giá checkout trước khi đặt | [quote.service.ts](server/src/modules/orders/quote.service.ts) |
| Cấu trúc snapshot đơn hàng | [order.model.ts](server/src/modules/orders/order.model.ts) |
| Xác nhận thanh toán COD | [payment.service.ts](server/src/modules/payments/payment.service.ts) |
| Tiến trình vận chuyển và điều kiện cập nhật | [shipping.service.ts](server/src/modules/shipping/shipping.service.ts), [shipping.types.ts](server/src/modules/shipping/shipping.types.ts) |
| Mã giảm giá | `server/src/modules/coupons/` |
| Đánh giá và kiểm duyệt | `server/src/modules/reviews/` |
| Báo cáo doanh thu/thống kê | `server/src/modules/dashboard/` |
| Yêu cầu sau mua, thông báo, lịch sử kho | [operations.router.ts](server/src/modules/operations/operations.router.ts), [operations.models.ts](server/src/modules/operations/operations.models.ts) |
| Ghi nhật ký quản trị, truy vấn nhật ký | [audit.service.ts](server/src/modules/operations/audit.service.ts), [audit.router.ts](server/src/modules/operations/audit.router.ts) |
| Nội dung cửa hàng và cách tính phí giao hàng | [store.router.ts](server/src/modules/store/store.router.ts), [store.model.ts](server/src/modules/store/store.model.ts) |

## 7. Bốn ví dụ tìm đúng chỗ để sửa

### A. Đổi câu giới thiệu trang chủ

Mở `client/src/Home.tsx`, tìm `Chọn thiết bị.` hoặc đoạn `<p>` ngay bên dưới. Chỉ sửa phần chữ, giữ nguyên thẻ JSX, dấu ngoặc và thuộc tính. Lưu file, xem lại trên web ở chế độ dev. Đừng sửa tên/giá sản phẩm bằng cách chèn dữ liệu cố định tại đây; sản phẩm đang được lấy từ API.

### B. Đổi logo chữ hoặc menu

Mở `client/src/App.tsx`, tìm `wordmark-name` hoặc `header-links`. Logo chữ có ở cả header và footer. Màu/kích thước tìm `.wordmark` trong `storefront.css`. Trường tên cửa hàng trong trang quản trị hiện không tự thay thế toàn bộ chữ thương hiệu viết sẵn trong React.

### C. Thêm một trường dữ liệu sản phẩm mới

Ví dụ muốn thêm trường mới ngoài các trường đã có: bắt đầu ở `product.model.ts`, kiểm tra/cho phép đầu vào trong controller hoặc `product-details.ts`, cập nhật kiểu của service nếu cần; sau đó thêm kiểu ở `client/src/types.ts`, ô nhập ở `Admin.tsx` và chỗ hiển thị ở `ProductDetails.tsx`. Cuối cùng kiểm tra lưu/đọc/sửa/xóa giá trị. Chỉ thêm input frontend thì backend có thể bỏ qua trường đó.

Nếu đó chỉ là một thông số như RAM hoặc dung lượng SSD, bạn đã có bảng thông số linh hoạt; nhập trên quản trị thường không cần thêm cột mới vào model.

### D. Thay quy tắc phí giao hàng hoặc trạng thái đơn

Đổi số tiền phí cố định/ngưỡng miễn phí: dùng **Quản trị → Cửa hàng**. Chỉ khi muốn đổi công thức nghiệp vụ mới mở `store.model.ts` và kiểm tra cả `quote.service.ts`, `order.service.ts`. Đổi chữ tổng tiền trên frontend không thay được số tiền backend chấp nhận.

Thay tiến trình vận chuyển cần xem `shipping.types.ts` và `shipping.service.ts`, sau đó cập nhật lựa chọn trạng thái trong `Admin.tsx` và nhãn trong `api.ts`. Không tự sửa trạng thái đơn trong MongoDB để vượt quy tắc; tồn kho, thanh toán và vận đơn cần nhất quán.

## 8. Cấu hình

Cấu hình thật nằm ở `server/.env`; [server/.env.example](server/.env.example) là mẫu để đối chiếu tên biến. Không ghi mật khẩu/khóa thật vào tài liệu hay source frontend.

| Biến | Tác dụng | Khi nào đụng tới? |
| --- | --- | --- |
| `NODE_ENV` | Development/production; ảnh hưởng cookie và yêu cầu xác minh mặc định | Khi chuyển môi trường triển khai |
| `PORT` | Cổng backend, mặc định 5000 | Khi cổng bị chiếm hoặc cấu hình hosting khác |
| `MONGODB_URI` | Database mà server đang kết nối | Chuyển database/môi trường; đổi sai có thể khiến bạn nhìn nhầm dữ liệu |
| `JWT_ACCESS_SECRET` | Khóa ký token, tối thiểu 32 byte | Thiết lập ban đầu hoặc luân chuyển khóa; đổi khóa làm token đã ký không còn hợp lệ |
| `PUBLIC_APP_URL` | Địa chỉ frontend dùng trong liên kết email và kiểm tra origin | Khi đổi địa chỉ web; production dùng HTTPS |
| `CORS_ORIGINS` | Những origin frontend được phép đọc response khác origin | Khi tách frontend/API; điền đúng cả giao thức và cổng |
| `MAIL_TRANSPORT` | `disabled` khi chưa có dịch vụ; hỗ trợ `smtp` cho Gmail demo và `resend` | Xem [GMAIL-SETUP.md](GMAIL-SETUP.md) để kết nối Gmail |
| `MAIL_FROM`, `RESEND_API_KEY` | Người gửi và khóa provider | Khi đã có sender/domain được xác minh |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Máy chủ, cổng, Gmail và mật khẩu ứng dụng; chỉ điền trong `server/.env` | Gmail demo dùng `smtp.gmail.com:465`; kiểm tra bằng `npm run config:check` và `npm run email:verify` |
| `EMAIL_VERIFICATION_REQUIRED` | Có bắt xác minh email hay không | Development mặc định chưa bắt; production mặc định bắt |
| `UPLOAD_DIRECTORY` | Nơi lưu file upload; mặc định `var/uploads` theo thư mục chạy server | Khi triển khai hoặc bố trí ổ lưu trữ bền vững |
| `TRUSTED_PROXIES` | Proxy thật được tin cậy để xác định thông tin request | Khi hạ tầng có reverse proxy |

Frontend chuyển `/api` đến backend qua [client/vite.config.ts](client/vite.config.ts). Biến `API_TARGET` đặt ở terminal chạy frontend dùng để đổi backend đích. `VITE_API_URL` được đọc trong `api.ts` nếu cần đặt API URL riêng; biến có tiền tố `VITE_` được đưa vào mã frontend nên không dùng để cất secret.

Sau khi sửa `.env`, hãy dừng và chạy lại backend. Sau khi đổi biến môi trường của frontend, chạy lại Vite; bản đã build cần build lại để nhận biến `VITE_` mới.

## 9. Tìm lỗi

| Triệu chứng | Kiểm tra theo thứ tự |
| --- | --- |
| Trang web không mở | Terminal frontend còn chạy? Có đúng `127.0.0.1:5173` không? Cổng bị dùng bởi tiến trình khác? |
| Web mở nhưng không có dữ liệu/không đăng nhập | Mở `/health` backend, xem terminal backend, kiểm tra MongoDB và API đích |
| Backend báo thiếu JWT secret hoặc MongoDB | Đối chiếu tên biến trong `server/.env.example`, kiểm tra cấu hình `.env`, rồi chạy lại backend |
| Dữ liệu khác lần trước | Có đang dùng `dev:demo`, `API_TARGET=...5001`, database khác hoặc tài khoản khác không? |
| Sản phẩm không xuất hiện | Sản phẩm/danh mục có bị ẩn? Bộ lọc đang áp dụng? Kiểm tra đúng database |
| Không thêm được vào giỏ | Tồn kho còn đủ? Tài khoản có phải CUSTOMER? STAFF/ADMIN không đặt đơn như khách |
| Nhân viên bị chuyển về đổi mật khẩu | Đây là bước bắt buộc. Nếu mật khẩu tạm hết hạn, admin cấp lại; không xóa cờ trong database để bỏ qua |
| Gửi quên mật khẩu báo chưa cấu hình | Dịch vụ email đang tắt; cần cấu hình provider thật. Không có mã/email giả để lấy từ màn hình |
| Báo không có quyền | Kiểm tra vai trò và trạng thái tài khoản; quyền không được quyết định chỉ bởi menu đang hiện |
| Không chuyển được trạng thái vận chuyển | Kiểm tra trạng thái hiện tại và lựa chọn tiếp theo hợp lệ; thất bại/hoàn cần ghi chú |
| Doanh thu chưa tăng | Đơn đã giao chưa đồng nghĩa PAID; kiểm tra đã đối soát và xác nhận thu tiền thật chưa |
| Ảnh upload mất sau khi chuyển máy | Kiểm tra thư mục upload có được sao lưu/chuyển cùng hay không; Git không chứa các file upload mặc định |
| Sửa CSS không thay đổi | Kiểm tra file tải sau/selector cụ thể hơn trong DevTools; có đang xem `preview` của bản build cũ không? |

Để xem lỗi trình duyệt: nhấn **F12**, mở **Console** để xem lỗi JavaScript và **Network** để xem request `/api`. Chú ý đường dẫn, mã HTTP và thông báo trả về. Không đăng công khai Authorization header, cookie, mật khẩu hoặc response cấp mật khẩu tạm khi nhờ hỗ trợ.

## 10. Kiểm tra sau khi sửa code

Chạy trong đúng thư mục; lệnh ở thư mục gốc sẽ không tìm thấy `package.json`.

```powershell
# Backend
Set-Location D:\CommerceHub\server
npm run build
npm test
```

```powershell
# Frontend
Set-Location D:\CommerceHub\client
npm test
npm run build
npx playwright test
```

`build` kiểm tra TypeScript và tạo `dist`; `test` kiểm tra tự động; Playwright kiểm tra luồng qua trình duyệt. E2E tự mở database/API demo riêng và preview cổng 4173; cần để trống cổng 5001/4173. Cấu hình trình duyệt mặc định là Edge trên Windows trong [playwright.config.ts](client/playwright.config.ts).

`npm run preview` trong `client` xem bản đã build ở cổng 4173, không tự cập nhật theo mọi sửa đổi source như `dev`; muốn xem sửa mới phải build lại. Preview và việc chạy localhost chưa phải triển khai website ra Internet.

Sửa nhỏ một câu chữ/CSS: build và xem đúng trang/độ rộng màn hình bị ảnh hưởng. Sửa giá, tồn, thanh toán, trạng thái, mật khẩu hoặc quyền: kiểm tra cả backend và luồng trình duyệt liên quan bằng dữ liệu thử.

## 11. Dữ liệu và sao lưu

Để khôi phục một cửa hàng, cần giữ được cả **mã nguồn**, **database MongoDB**, **ảnh upload** và **cấu hình máy chủ**. Chỉ sao chép thư mục `client` hoặc xuất CSV một trang bảng không phải bản sao lưu đầy đủ.

- Lưu phiên bản source bằng Git sau khi kiểm tra; dùng `git status` để biết file đang thay đổi. `.env`, upload và `.local` được bỏ qua trong Git, cần quản lý riêng nếu muốn sao lưu.
- Dùng cơ chế backup của dịch vụ MongoDB hoặc MongoDB Database Tools phù hợp với môi trường của bạn; đặt lịch và xác minh khả năng phục hồi. Dự án hiện chưa tự lên lịch backup/restore database.
- Sao lưu đúng thư mục `UPLOAD_DIRECTORY`; nếu không đặt biến và chạy từ `server`, đó là `server/var/uploads`. Giữ cả ảnh tĩnh trong `client/public/images` cùng source.
- Cất `.env`/khóa dịch vụ ở nơi riêng có kiểm soát truy cập. Không dán nội dung đó vào báo cáo hoặc đưa lên repository.
- Trước thay đổi nghiệp vụ/dữ liệu lớn, dùng demo để thử. Các script như `apply-product-photos.ts` và `migrate-payments.ts` có thể thay đổi dữ liệu; đọc script và hướng dẫn của chúng trước, không coi chúng là lệnh chạy web hằng ngày.

Chức năng chưa có hiện tại: thanh toán online/webhook ngân hàng, kết nối tự động hãng vận chuyển, hóa đơn điện tử, tự động hoàn tiền, lời mời nhân viên qua email và xác thực hai lớp. Chi tiết tại [COMPLETENESS.md](COMPLETENESS.md) và [STAFF-MANAGEMENT.md](STAFF-MANAGEMENT.md).

## 12. Lộ trình tự làm quen

1. Chạy backend/frontend, đăng nhập đúng tài khoản và xem hết các mục quản trị.
2. Trong demo, tạo một danh mục/sản phẩm, chỉnh tồn, làm một đơn thử đến thu COD; xem sổ kho và nhật ký.
3. Tạo một nhân viên thử, hoàn tất đổi mật khẩu, cấp lại và khóa để hiểu quyền.
4. Mở `Home.tsx`, tìm một câu đang thấy trên web và thử đổi chữ trên bản phát triển; sau đó xem `App.tsx` và `storefront.css`.
5. Đọc một luồng hoàn chỉnh: `AdminStaff.tsx` gọi `api.ts` → `/api/admin/users` trong `app.ts` → `staff-admin.router.ts` → `User`/MongoDB và `audit.service.ts`. Đây là cách lần theo một thao tác từ màn hình đến dữ liệu.

Không cần thuộc toàn bộ dự án ngay. Khi muốn sửa một phần, xác định đó là **dữ liệu**, **giao diện** hay **nghiệp vụ**, rồi tra đúng bảng ở trên.

Module chat: xem [CHAT-GUIDE.md](CHAT-GUIDE.md) để biết cách tiếp nhận hội thoại, phân công nhân viên, sửa kịch bản bot và vị trí tích hợp API AI sau này.
