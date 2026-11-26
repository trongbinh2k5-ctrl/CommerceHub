# BerylCore

Nhận diện cho dự án thương mại điện tử trong portfolio của Bình.

Logo là chữ B hình khối, với điểm nhấn hình thoi màu cam tượng trưng cho một lõi năng lượng. Chữ B gắn với Bình và Beryl; Core gợi công nghệ và nền tảng.

## Tệp sử dụng

- `client/public/brand/berylcore-symbol.svg`: biểu tượng độc lập, dùng cho avatar và favicon.
- `client/public/brand/berylcore-light.svg`: logo đầy đủ trên nền sáng.
- `client/public/brand/berylcore-dark.svg`: logo đầy đủ trên nền tối.
- `client/public/brand/brand-sheet.html`: bảng xem trước. Mở tại `http://127.0.0.1:5173/brand/brand-sheet.html` khi frontend đang chạy.
- `client/src/BrandLogo.tsx`: logo dùng chung trên website.
- `client/src/brand.css`: kích thước và cách hiển thị logo trên các màn hình.
- `client/index.html`: tên tab, mô tả và đường dẫn favicon.

## Quy chuẩn

| Thành phần | Giá trị |
|---|---|
| Xanh chủ đạo | `#2459E0` |
| Xanh đậm | `#182846` |
| Điểm nhấn cam | `#FFB166` |
| Nền sáng | `#FFFFFF` |
| Chữ trên nền tối | `#F0F5FF` |
| Phông chữ | Be Vietnam Pro, độ đậm 600 |

Viết tên **BerylCore**, giữ chữ B và C viết hoa. Giữ tỉ lệ logo và khoảng trống quanh biểu tượng tối thiểu bằng 1/4 chiều cao biểu tượng. Dùng biểu tượng riêng ở kích thước nhỏ; tránh thêm bóng, viền hoặc hiệu ứng chuyển động vào logo. Logo SVG đầy đủ dùng chữ sống: cài Be Vietnam Pro trước khi nhập vào công cụ thiết kế, hoặc chuyển chữ thành đường nét khi xuất bản in. Giấy phép phông chữ nằm tại `client/public/fonts/OFL-BeVietnamPro.txt`.

Tên thư mục dự án và tên kỹ thuật trong package/database vẫn có thể là CommerceHub. Đây không phải nội dung hiển thị của thương hiệu. Tên cửa hàng do admin quản lý tại Quản trị → Cài đặt; nếu dữ liệu cũ còn tên CommerceHub, đổi riêng trường tên cửa hàng thành BerylCore rồi lưu.

Gợi ý ghi trên CV: **BerylCore — Full-stack Electronics E-commerce Platform**. Chỉ liệt kê các chức năng đã triển khai và kiểm thử; các tích hợp email/thanh toán chưa cấu hình cần được mô tả đúng trạng thái.
