# Nguồn ảnh

Phông hiện tại là **Be Vietnam Pro**, đóng gói qua `@fontsource/be-vietnam-pro` ở các weight 400/500/600/700. Giấy phép SIL Open Font License 1.1 lưu tại `public/fonts/OFL-BeVietnamPro.txt`. Các phông được phục vụ cùng ứng dụng, hỗ trợ đầy đủ Latin và dấu tiếng Việt. Inter là phông của phiên bản trước.

## Ảnh sản phẩm trên mạng — đang dùng

Theo lựa chọn model được người dùng giao, ba tên laptop thử đã được chuẩn hóa thành các model dưới đây; giá, tồn kho, SKU và danh mục được giữ nguyên. Ảnh đã tải về `public/images/products/` và đường dẫn được lưu vào database. Nguồn/URL CDN và ngày kiểm tra cũng được lưu trong `public/images/products/sources.json`.

| Model | File | Trang nguồn |
| --- | --- | --- |
| ASUS Vivobook 15 X1504 | `public/images/products/asus-vivobook-15-x1504.png` | [ASUS Vivobook 15 X1504](https://www.asus.com/laptops/for-home/vivobook/asus-vivobook-15-x1504/) |
| ASUS ROG Strix G16 (2024) G614 | `public/images/products/asus-rog-strix-g16-2024.png` | [ASUS ROG Strix G16 gallery](https://rog.asus.com/laptops/rog-strix/rog-strix-g16-2024/gallery/) |
| ASUS TUF Gaming F15 (2023) FX507 | `public/images/products/asus-tuf-gaming-f15-2023.png` | [ASUS TUF Gaming F15 (2023)](https://www.asus.com/laptops/for-gaming/tuf-gaming/asus-tuf-gaming-f15-2023/) |
| Intel Core i5-14600K | `public/images/products/intel-core-i5-14600k.jpg` | [Newegg đúng mã BX8071514600K](https://www.newegg.com/p/N82E16819118470), [đối chiếu model với Intel](https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/ordering.html) |

Ảnh ASUS là ảnh hãng của họ model tương ứng; không suy ra một cấu hình RAM/SSD/GPU cụ thể từ ảnh. Ảnh Intel là ảnh hộp + CPU từ nhà bán lẻ Newegg, không gọi là ảnh Intel-hosted. Không chỉnh sửa nội dung các ảnh tải về. Bộ ảnh AI bên dưới thuộc phiên bản cũ/ảnh minh họa dự phòng, không thay thế ảnh thật của bốn sản phẩm hiện tại.

## Bộ hình phần cứng v2

Tạo bằng **image_gen tích hợp**, theo skill imagegen; các file cuối được sao chép vào workspace:

- `public/images/hero-hardware-v2.png`: ảnh chiến dịch laptop, dùng ở trang chủ.
- `public/images/laptop-illustration.png`: ảnh minh họa nhóm laptop khi bản ghi chưa có `imageUrl`.
- `public/images/processor-illustration.png`: ảnh minh họa nhóm CPU khi bản ghi chưa có `imageUrl`.

Đây là ảnh minh họa không thương hiệu, không phải ảnh xác nhận model/SKU đang bán. Giao diện ghi rõ “Ảnh minh họa” khi dùng dự phòng; URL ảnh sản phẩm đã nhập luôn được ưu tiên. Không ghi các đường dẫn minh họa này vào database. Tại lần kiểm tra trước khi nhập ảnh web, bốn sản phẩm thật đều chưa có `imageUrl`; hiện cả bốn đã được gắn ảnh web trong bảng phía trên.

### Prompt cuối — ảnh chiến dịch

Use case: ads-marketing. Asset type: premium electronics storefront homepage hero, landscape 3:2 composition. Create a highly polished studio photograph of a single unbranded modern dark graphite gaming laptop, open at about 105 degrees, floating just above a monolithic brushed-aluminum plinth, three-quarter front angle. Screen displays an elegant abstract electric cobalt light ribbon on deep black, no software interface, no readable text. Backdrop is deep charcoal with a restrained cobalt edge glow, tactile soft shadows, exceptional clean material detail. Laptop occupies center-right with generous breathing space and full device visible; the left third remains dark and atmospheric for optional HTML overlays but DO NOT render any text. Minimal art direction, dramatic directional studio lighting, believable hardware proportions, tasteful precise reflections. Purpose is a brand-agnostic campaign illustration for CommerceHub, not a photo of any specific ASUS/ROG or other model. No logo, no branding, no badges, no watermark, no invented specifications, no extra devices or accessories.

### Prompt cuối — laptop minh họa

Use case: product-mockup. Asset type: square electronics category illustration for missing laptop photos, clearly used by a website with an external 'Ảnh minh họa' label. A single unbranded premium graphite notebook computer open at 105 degrees, three-quarter front angle facing slightly left, fully visible centered with generous 15 percent padding all sides, elegant thin but believable chassis, black keyboard, abstract electric blue ribbon on its screen. Soft pale warm-gray seamless studio background (#f1f2ef), a subtle grounded contact shadow, crisp photoreal product lighting, high tactile realism. Match a sophisticated Vietnamese hardware storefront with paper/ink/cobalt identity. No text, no logo, no branding, no watermark, no packaging, no accessories, no specific brand/model details. This is generic illustrative laptop imagery, not a representation of any exact sale SKU.

### Prompt cuối — CPU minh họa

Use case: product-mockup. Asset type: square generic processor category illustration for a hardware storefront when a product lacks a real photo. Photograph-like macro studio composition of one generic desktop CPU processor, square metallic brushed silver heat spreader with a dark teal PCB edge, lying at a 20-degree angle on a pale warm-gray seamless backdrop (#f1f2ef), fully visible centered with generous padding, intricate realistic microelectronics edges, tasteful thin cobalt rim light and soft contact shadow. Refined commercial hardware photography, clearly a generic illustration rather than a specific Intel or AMD retail product. No readable text or markings anywhere, no brand/logo, no numbers, no package or accessories, no watermark. Keep silver metal realistic and geometry plausible.

## Bộ ảnh demo ban đầu

- `public/images/hero-headphones.png`: tạo bằng công cụ image_gen tích hợp (skill imagegen), dành cho ảnh ý tưởng chủ đạo của CommerceHub. Không phải ảnh hàng hóa thực tế. Đã kiểm tra và sao chép file vào repo.
- `public/images/keyboard.jpg`: https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=85
- `public/images/monitor.jpg`: https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&q=85
- `public/images/mouse.jpg`: https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=800&q=85

Ba ảnh tải từ Unsplash chỉ dùng cho danh mục demo, không khẳng định model/spec của sản phẩm bán thật. Thay bằng ảnh có quyền sử dụng phù hợp khi vận hành cửa hàng.

## Prompt ảnh chủ đạo

Use case: product-mockup. Asset type: square editorial hero photograph for CommerceHub, a Vietnamese contemporary electronics storefront with black, off-white and electric cobalt visual identity. Photograph sculptural matte graphite over-ear headphones, unbranded, resting diagonally on a low brushed-aluminum cube on light grey seamless studio background. Single strong hard sidelight from upper left, distinctive long sharp shadow, highly tactile materials, premium industrial product photography, slight high camera angle, full headphones visible, enough neutral margin for responsive crop. No text, no logo, no watermark, no UI, no extra objects. Photorealistic, restrained, confident.
