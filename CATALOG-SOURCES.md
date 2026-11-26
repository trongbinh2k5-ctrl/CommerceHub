# Sản phẩm và nguồn tham khảo — 07/11/2026

Đã bổ sung **12 sản phẩm**, nâng danh sách công khai lên **16 sản phẩm, 8 danh mục và 6 thương hiệu**. Ảnh được tải từ trang hãng về `client/public/images/catalog-2026-11/`; không phụ thuộc tải ảnh từ máy chủ ngoài khi khách mở trang. Mô tả do dự án biên soạn ngắn từ thông tin hãng; không sao chép bài đánh giá hoặc tạo đánh giá giả.

## Danh sách bổ sung

| Sản phẩm | Thông tin được giới thiệu | Nguồn chính hãng |
| --- | --- | --- |
| MacBook Air 13 inch M5 | CPU 10 lõi, GPU 8 lõi; bộ nhớ 16GB, SSD 512GB; màn hình 13,6 inch | [Apple Việt Nam](https://www.apple.com/vn/macbook-air/specs/) |
| MacBook Air 15 inch M5 | CPU/GPU 10 lõi; bộ nhớ 16GB, SSD 512GB; màn hình 15,3 inch | [Apple Việt Nam](https://www.apple.com/vn/macbook-air/specs/) |
| Odyssey G5 G55C 27 inch | LS27CG552EEXXV, QHD, 165Hz, cong | [Samsung Việt Nam](https://www.samsung.com/vn/monitors/gaming/odyssey-g5-g55c-27-inch-165hz-curved-qhd-ls27cg552eexxv/) |
| Odyssey G5 G50D 27 inch | LS27DG502EEXXV, QHD, IPS, 180Hz | [Samsung Việt Nam](https://www.samsung.com/vn/monitors/gaming/odyssey-g5-g50d-27-inch-180hz-ips-qhd-ls27dg502eexxv/) |
| MX Keys S | Bàn phím không dây đầy đủ, đèn nền, Graphite | [Logitech Việt Nam](https://www.logitech.com/vi-vn/shop/p/mx-keys-s.920-011563) |
| MX Keys Mini | Bàn phím không dây nhỏ gọn, đèn nền, Graphite | [Logitech Việt Nam](https://www.logitech.com/vi-vn/shop/p/mx-keys-mini.920-010505) |
| MX Master 3S | Chuột không dây, cảm biến 8K, cuộn MagSpeed, Graphite | [Logitech Việt Nam](https://www.logitech.com/vi-vn/shop/p/mx-master-3s) |
| G502 HERO | Chuột gaming có dây, HERO, RGB | [Logitech G Việt Nam](https://www.logitechg.com/vi-vn/shop/p/g502-hero-gaming-mouse) |
| WH-1000XM5 | Chụp tai, chống ồn, Bluetooth 5.2; bản đen | [Sony Việt Nam](https://www.sony.com.vn/electronics/tai-nghe-choang-dau-tai-nghe/wh-1000xm5/specifications) |
| WF-C710N | Tai nghe không dây, màng loa 5mm, IPX4; ảnh bản xanh trong suốt | [Sony Việt Nam](https://www.sony.com.vn/electronics/support/wireless-headphones-bluetooth-headphones/wf-c710n/specifications) |
| 990 PRO 1TB | MZ-V9P1T0BW, M.2 2280, PCIe 4.0 x4 | [Samsung Việt Nam](https://www.samsung.com/vn/memory-storage/nvme-ssd/990-pro-1tb-nvme-pcie-gen-4-mz-v9p1t0bw/) |
| T7 Shield 1TB đen | MU-PE1T0S/WW, USB 3.2 Gen 2, IP65 | [Samsung Việt Nam](https://www.samsung.com/vn/memory-storage/portable-ssd/t7-shield-1tb-black-external-storage-nvme-1050-mb-s-mu-pe1t0s-ww/) |

Thông số tốc độ, thời lượng pin và bảo vệ bụi/nước là mức công bố với điều kiện thử nghiệm của hãng. Không tự suy diễn xuất xứ, bảo hành cửa hàng, phụ kiện của lô hàng hay cấu hình chính xác cho các laptop ASUS cũ chưa có mã SKU hãng đầy đủ.

## Giá và tồn kho

Sản phẩm mới có `price: 0`, `stock: 0`. Frontend hiển thị **Liên hệ báo giá**, không hiển thị giá 0 đồng và không công bố dữ liệu Offer giá 0 trong SEO. Đây là danh mục giới thiệu; giá trên website hãng hoặc bên bán khác không được gán thành giá bán của CommerceHub.

Để mở bán, vào **Quản trị → Thiết bị → Sửa** để nhập giá bán thực tế, xác nhận phiên bản, tình trạng, bảo hành và phụ kiện. Sau đó điều chỉnh tồn kho theo hàng đã kiểm đếm, kèm lý do. Giá và tồn kho của sản phẩm cũ được giữ nguyên.

## Quản lý các trang mới

- Danh mục: `/collections`; từng nhóm dùng `/collections/:slug`. Quản lý tên, mô tả, trạng thái ở **Quản trị → Danh mục**.
- Thương hiệu: `/brands`; từng hãng dùng `/brands/:brand`. Giá trị lấy từ trường **Thương hiệu** của sản phẩm công khai.
- Trang chủ chọn sản phẩm từ nhiều danh mục để tránh lặp cả một nhóm trong khu nổi bật. Banner giữ phong cách hiện tại và ưu tiên giới thiệu một laptop khi có dữ liệu phù hợp.
- Nguồn và ngày tra cứu nằm cuối bảng thông số sản phẩm; liên kết nguồn mở trang hãng.

## Nhập lại và sao lưu

Kế hoạch đầy đủ gồm SKU nội bộ, thông số, nguồn và URL ảnh gốc tại [researched-catalog-2026-11-07.json](server/data/researched-catalog-2026-11-07.json). Các SKU `CH-...` là mã quản lý nội bộ, không tự nhận là mã linh kiện của nhà sản xuất. Mã hãng được ghi ở trường model khi xác định được.

Script [import-researched-catalog.ts](server/src/scripts/import-researched-catalog.ts) kiểm tra tệp ảnh, đọc kế hoạch và mặc định chỉ xem trước. Chạy từ thư mục `server`:

```powershell
npx tsx src/scripts/import-researched-catalog.ts
# Chỉ dùng khi chủ động muốn ghi dữ liệu theo kế hoạch:
npx tsx src/scripts/import-researched-catalog.ts --apply
```

SKU đã tồn tại được bỏ qua; script không đè giá, tồn kho và nội dung sản phẩm mới đã chỉnh sau khi nhập. Tuy nhiên, tên/mô tả danh mục trong kế hoạch và thương hiệu/model/danh mục của 4 sản phẩm cũ sẽ được áp dụng lại khi dùng `--apply`. Không chạy lại nếu bạn muốn giữ những trường đó sau khi tự sửa. Các mục ẩn không bị mở lại. Không ghi tài khoản hoặc đơn hàng. Tất cả thay đổi database nằm trong transaction; có kiểm tra thay đổi đồng thời.

Bản sao trước lần nhập đã thực hiện: `.local/catalog-backups/1794051118957-before.json`; biên nhận ID tạo mới ở tệp `1794051118957-receipt.json` cùng thư mục. Đây là bản sao riêng của các mục bị tác động, không thay thế backup toàn bộ database. Nhập bằng script bảo trì không tự tạo nhật ký thao tác từ tài khoản admin trên web.
