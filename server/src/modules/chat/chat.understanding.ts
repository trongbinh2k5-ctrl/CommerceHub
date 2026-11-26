/** Lightweight, deterministic Vietnamese intent parsing. No model or external API. */
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\b(ko|k0|khum|hok)\b/g, 'khong').replace(/\s+/g, ' ').trim();
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export interface AssistantContext { recentQuestions?: string[] }
export interface Budget { min?: number; max?: number; invalid?: boolean }
const number = '(\\d+(?:[.,]\\d+)*)';
const unit = '(trieu|tr|cu|nghin|ngan|k|vnd|dong|d)';
function amount(raw: string, suffix = '') {
  const value = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw) ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'));
  return value * (/^(trieu|tr|cu)$/.test(suffix) ? 1_000_000 : /^(nghin|ngan|k)$/.test(suffix) ? 1000 : 1);
}
export function parseBudget(text: string): Budget | undefined {
  const n = normalize(text);
  const range = n.match(new RegExp(`(?:tu\\s+|khoang\\s+)?${number}\\s*${unit}?\\s*(?:den|toi|[-–])\\s*${number}\\s*${unit}?\\b`));
  let result: Budget | undefined;
  if (range && (range[2] || range[4])) result = { min: amount(range[1], range[2] || range[4]), max: amount(range[3], range[4] || range[2]) };
  else {
    const single = n.match(new RegExp(`${number}\\s*${unit}\\b`)) || n.match(new RegExp(`(?:duoi|tren|toi da|it nhat|ngan sach|tam gia)\\s+${number}(?![\\d.,])\\b`));
    if (!single) return undefined;
    const value = amount(single[1], single[2]);
    result = /(?:tren|tu|it nhat|toi thieu|hon)\s+\d/.test(n) ? { min: value } : { max: value };
  }
  if (Object.values(result).some(v => !Number.isFinite(v) || Number(v) <= 0 || Number(v) > 100_000_000_000) || (result.min !== undefined && result.max !== undefined && result.min > result.max)) return { invalid: true };
  return result;
}

export const categoryIntents = [
  { key: 'gpu', pattern: /\b(gpu|vga|card do hoa|card man hinh)\b/, categories: ['card do hoa', 'gpu', 'vga'], names: 'geforce|radeon|rtx|gtx|card đồ họa' },
  { key: 'laptop', pattern: /\b(laptop|lap top|notebook|macbook|may tinh xach tay)\b/, categories: ['laptop', 'may tinh xach tay'], names: 'laptop|notebook|macbook' },
  { key: 'monitor', pattern: /\b(man hinh|monitor|display)\b/, categories: ['man hinh'], names: 'màn hình|monitor|display' },
  { key: 'keyboard', pattern: /\b(ban phim|keyboard|phim co)\b/, categories: ['ban phim'], names: 'bàn phím|keyboard' },
  { key: 'mouse', pattern: /\b(chuot|mouse)\b/, categories: ['chuot'], names: 'chuột|mouse' },
  { key: 'headphones', pattern: /\b(tai nghe|headphone|headset|earbud)\b/, categories: ['tai nghe', 'am thanh'], names: 'tai nghe|headphone|headset|earbud' },
  { key: 'cpu', pattern: /\b(cpu|bo xu ly|vi xu ly)\b/, categories: ['cpu', 'bo xu ly'], names: 'cpu|core i|core ultra|ryzen' },
  { key: 'ram', pattern: /\b(ram|bo nho trong)\b/, categories: ['ram', 'bo nho'], names: 'ram|ddr[345]' },
  { key: 'storage', pattern: /\b(ssd|hdd|o cung|luu tru)\b/, categories: ['ssd', 'o cung', 'luu tru'], names: 'ssd|hdd|ổ cứng' },
  { key: 'mainboard', pattern: /\b(mainboard|bo mach chu|motherboard)\b/, categories: ['bo mach chu', 'mainboard'], names: 'mainboard|motherboard|bo mạch chủ' },
  { key: 'psu', pattern: /\b(psu|bo nguon|nguon may tinh)\b/, categories: ['bo nguon', 'nguon'], names: 'psu|power supply|bộ nguồn' },
] as const;
const brands: [RegExp, string][] = [[/\b(apple|macbook)\b/, 'Apple'], [/\b(asus|rog|tuf)\b/, 'ASUS'], [/\bdell\b/, 'Dell'], [/\bhp\b/, 'HP'], [/\blenovo\b/, 'Lenovo'], [/\bacer\b/, 'Acer'], [/\bmsi\b/, 'MSI'], [/\bsamsung\b/, 'Samsung'], [/\blg\b/, 'LG'], [/\b(logitech|logi)\b/, 'Logitech'], [/\bintel\b/, 'Intel'], [/\bamd\b/, 'AMD'], [/\bcorsair\b/, 'Corsair'], [/\bkingston\b/, 'Kingston'], [/\bsony\b/, 'Sony'], [/\brazer\b/, 'Razer'], [/\bgigabyte\b/, 'Gigabyte']];
export function understandShopping(text: string, context: AssistantContext = {}) {
  const n = normalize(text), explicitCategory = categoryIntents.find(c => c.pattern.test(n));
  const currentBrand = brands.find(([pattern]) => pattern.test(n))?.[1];
  const currentBudget = parseBudget(n);
  const followUp = !explicitCategory && (!!currentBudget || !!currentBrand || /con hang|san hang|co san|het hang|re hon|gia thap|gia cao/.test(n));
  // Stop at the most recent explicit category so a new search does not inherit an older category's budget.
  const previous: string[] = [];
  if (followUp) for (const q of [...(context.recentQuestions || [])].reverse()) { previous.push(normalize(q)); if (categoryIntents.some(c => c.pattern.test(normalize(q)))) break; }
  const category = explicitCategory || previous.map(q => categoryIntents.find(c => c.pattern.test(q))).find(Boolean);
  const brand = currentBrand || (!explicitCategory ? previous.map(q => brands.find(([pattern]) => pattern.test(q))?.[1]).find(Boolean) : undefined);
  const budget = currentBudget || previous.map(parseBudget).find(Boolean);
  const stock = /het hang/.test(n) ? 'OUT' : /(?:con hang|san hang|co san|hang san)/.test(n) && !/khong (?:can|loc)/.test(n) ? 'IN' : undefined;
  return { category, brand, budget, stock, cheapest: /re nhat|re hon|gia thap|tiet kiem/.test(n), shopping: !!category || !!brand || !!budget || !!stock || /\b(san pham|thiet bi|tim|goi y|tu van|mua|gia|gaming|van phong|hoc tap)\b/.test(n) };
}

export function faqReply(text: string): string | undefined {
  const n = normalize(text);
  if (/quen (?:mat khau|mk)|lay lai (?:mat khau|mk)|reset password/.test(n)) return 'Chọn Đăng nhập → Quên mật khẩu và nhập email đã đăng ký. Việc gửi liên kết khôi phục phụ thuộc cấu hình email của cửa hàng. Nếu chưa nhận được, hãy kiểm tra thư rác hoặc liên hệ nhân viên; không gửi mật khẩu hay mã xác minh trong chat.';
  if (/dang ky|tao (?:tai khoan|tk)|register/.test(n)) return 'Chọn Tài khoản → Tạo tài khoản, nhập thông tin và mật khẩu. Nếu cửa hàng bật xác minh email, làm theo hướng dẫn xác minh trước khi đăng nhập. Không gửi mật khẩu trong cửa sổ chat.';
  if (/dang nhap|login|doi (?:mat khau|mk)|doi email|doi so dien thoai/.test(n)) return 'Bạn có thể đăng nhập từ biểu tượng Tài khoản. Đổi mật khẩu và cập nhật thông tin tại Tài khoản → Hồ sơ & bảo mật. Nếu quên mật khẩu, chọn Quên mật khẩu ở trang đăng nhập.';
  if (/don hang|tra cuu don|huy don|doi dia chi.*don/.test(n) && !/bao hanh|doi tra|doi hang|tra hang|hoan tien|phi ship|giao hang|van chuyen/.test(n)) return 'Vào Tài khoản → Đơn hàng của tôi để xem trạng thái hoặc thao tác với đơn của bạn. Trợ lý không truy cập hoặc thay đổi đơn hàng. Cần hỗ trợ thêm, hãy chọn Chat với cửa hàng.';
  if (/ma giam|giam gia|bot gia|khuyen mai|coupon|voucher|uu dai/.test(n)) return 'Nhập mã giảm giá tại bước Thanh toán. Hệ thống sẽ kiểm tra thời hạn và điều kiện của mã trước khi áp dụng. Mình không có chương trình ưu đãi nào được xác nhận để tự cung cấp mã; bạn có thể hỏi nhân viên.';
  if (/thanh toan|sepay|vn ?pay|\bcod\b|tra gop|chuyen khoan|the ngan hang|vi dien tu/.test(n)) return 'Các phương thức khả dụng được hiển thị tại bước Thanh toán. Với COD, bạn thanh toán khi nhận hàng. SePay xuất hiện khi cửa hàng đã cấu hình; hãy kiểm tra số tiền và môi trường thanh toán trước khi xác nhận. Chưa có thông tin xác nhận hỗ trợ trả góp; hãy hỏi nhân viên trước khi giao dịch.';
  if (/gio hang|them vao gio|dat mua|cach mua|mua nhu the nao/.test(n)) return 'Mở sản phẩm → chọn số lượng → Thêm vào giỏ → kiểm tra Giỏ hàng → Thanh toán. Bạn cần đăng nhập, chọn địa chỉ và xác nhận đơn. Sản phẩm hết hàng hoặc chưa có giá bán cần được cửa hàng xác nhận trước.';
  if (/tuong thich|lap duoc|co hop|co vua|so sanh|tot hon|choi.*game|do hoa|lap trinh|van phong|hoc tap/.test(n) && !/duoi|tren|trieu|\btr\b/.test(n)) return 'Bạn cho mình biết loại thiết bị, ngân sách và tên model/cấu hình đang dùng nhé. Mình có thể lọc sản phẩm và đọc thông số đã công bố. Để so sánh hiệu năng hoặc xác nhận tương thích, hãy gửi các model cho nhân viên; mình chưa đủ dữ liệu để khẳng định.';
  if (/^(cam on|thanks|thank you|thank|oke|ok|da cam on|hay qua|tuyet)([ !.,].*)?$/.test(n)) return 'Rất vui được hỗ trợ bạn! Bạn muốn tìm thêm thiết bị hay cần trao đổi với cửa hàng?';
  if (/^(tam biet|bye|hen gap lai)[ !.,]*$/.test(n)) return 'Hẹn gặp lại bạn tại BerylCore! Khi cần tư vấn thêm, bạn cứ mở lại chat nhé.';
  return undefined;
}
