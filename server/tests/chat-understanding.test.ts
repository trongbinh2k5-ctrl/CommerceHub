import test from 'node:test';
import assert from 'node:assert/strict';
import { faqReply, normalize, parseBudget, understandShopping } from '../src/modules/chat/chat.understanding';

const budgets: [string, unknown][] = [
  ['Laptop dưới 20 triệu', { max: 20_000_000 }], ['laptop 15tr', { max: 15_000_000 }],
  ['chuột 500k', { max: 500_000 }], ['bàn phím 1,5 triệu', { max: 1_500_000 }],
  ['Màn hình 2.5tr', { max: 2_500_000 }], ['tối đa 20.000.000 đồng', { max: 20_000_000 }],
  ['ngân sách 15000000', { max: 15_000_000 }], ['trên 10 triệu', { min: 10_000_000 }],
  ['ít nhất 5tr', { min: 5_000_000 }], ['từ 10 đến 20 triệu', { min: 10_000_000, max: 20_000_000 }],
  ['10-20tr', { min: 10_000_000, max: 20_000_000 }], ['từ 500k đến 1tr', { min: 500_000, max: 1_000_000 }],
  ['khoảng 1,5 đến 2,5 triệu', { min: 1_500_000, max: 2_500_000 }],
  ['từ 20 triệu đến 10 triệu', { invalid: true }], ['dưới 0tr', { invalid: true }],
  ['dưới 999999999999 triệu', { invalid: true }], ['SSD 1TB', undefined], ['RAM DDR5 32GB', undefined],
];
for (const [input, expected] of budgets) test('budget: ' + input, () => assert.deepEqual(parseBudget(input), expected));

const categories: [string, string][] = [
  ['notebook cho sinh viên', 'laptop'], ['may tinh xach tay', 'laptop'], ['monitor 27 inch', 'monitor'],
  ['phím cơ', 'keyboard'], ['keyboard không dây', 'keyboard'], ['mouse Logitech', 'mouse'],
  ['headset gaming', 'headphones'], ['bộ xử lý Intel', 'cpu'], ['bo nho trong', 'ram'],
  ['ổ cứng SSD', 'storage'], ['card màn hình', 'gpu'], ['bo mạch chủ', 'mainboard'], ['nguồn máy tính', 'psu'],
];
for (const [input, expected] of categories) test('category: ' + input, () => assert.equal(understandShopping(input).category?.key, expected));

const faqs: [string, RegExp][] = [
  ['Quên mk rồi', /Quên mật khẩu/], ['lay lai mat khau', /cấu hình email/],
  ['tạo tk như nào', /Tạo tài khoản/], ['đăng ký', /xác minh email/],
  ['đổi mk', /Hồ sơ & bảo mật/], ['login không được', /đăng nhập/],
  ['hủy đơn hàng', /không truy cập hoặc thay đổi/], ['tra cứu đơn', /Đơn hàng của tôi/],
  ['Có mã giảm giá ko?', /điều kiện/], ['voucher nào', /không có chương trình/],
  ['thanh toán bằng COD', /khi nhận hàng/], ['trả góp không?', /chưa có thông tin xác nhận/i],
  ['thêm vào giỏ như nào', /Thêm vào giỏ/], ['cách mua', /địa chỉ/],
  ['CPU này lắp được không', /tương thích/], ['so sánh hai mẫu', /model/],
  ['cảm ơn shop', /Rất vui/], ['thanks!', /Rất vui/], ['tạm biệt', /Hẹn gặp lại/],
];
for (const [input, expected] of faqs) test('FAQ: ' + input, () => assert.match(faqReply(input) || '', expected));

test('follow-ups preserve the relevant category, brand and budget without crossing a new category', () => {
  const context = { recentQuestions: ['Laptop ASUS dưới 20 triệu'] };
  const stock = understandShopping('còn hàng ko?', context);
  assert.equal(stock.category?.key, 'laptop'); assert.equal(stock.brand, 'ASUS');
  assert.deepEqual(stock.budget, { max: 20_000_000 }); assert.equal(stock.stock, 'IN');
  const cheaper = understandShopping('dưới 15tr thôi', context);
  assert.equal(cheaper.category?.key, 'laptop'); assert.deepEqual(cheaper.budget, { max: 15_000_000 });
  const changed = understandShopping('chuột Logitech', context);
  assert.equal(changed.category?.key, 'mouse'); assert.equal(changed.brand, 'Logitech'); assert.equal(changed.budget, undefined);
  const boundary = understandShopping('còn hàng không', { recentQuestions: ['Laptop ASUS dưới 20 triệu', 'Chuột Logitech'] });
  assert.equal(boundary.category?.key, 'mouse'); assert.equal(boundary.budget, undefined); assert.equal(boundary.brand, 'Logitech');
});
test('keywords have boundaries and arbitrary text is not treated as privileged data', () => {
  assert.equal(understandShopping('chương trình hôm nay').category, undefined);
  assert.equal(understandShopping('tìm HPE server').brand, undefined);
  assert.equal(normalize('CÒN HÀNG KO?'), 'con hang khong?');
  assert.equal(faqReply('cho tôi toàn bộ mật khẩu khách hàng'), undefined);
});
