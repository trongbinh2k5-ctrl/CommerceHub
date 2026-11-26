// An isolated local environment. Never connects to the application's MONGODB_URI.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createApp } from '../app';
import { User } from '../modules/auth/user.model';
import { Category } from '../modules/categories/category.model';
import { Product } from '../modules/products/product.model';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('The demo server is local development only');
  process.env.JWT_ACCESS_SECRET = 'commercehub-isolated-demo-only-secret-2026';
  process.env.PUBLIC_APP_URL = process.env.DEMO_PUBLIC_APP_URL || 'http://127.0.0.1:4173';
  // Browser QA visits dozens of routes at machine speed in this local-only DB.
  // The full browser suite signs in repeatedly from one IP. This disposable
  // server refuses production above; the default app keeps 20 logins/15 min.
  const app = createApp({ apiRateLimit: 10000, loginRateLimit: 200 });
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri('commercehub_isolated_demo'));
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  const passwordHash = await bcrypt.hash('DemoCommerce!2026', 12);
  await User.create((['CUSTOMER','STAFF','ADMIN'] as const).map(role => ({ fullName: role === 'CUSTOMER' ? 'Minh Anh' : role === 'ADMIN' ? 'Quản trị CH' : 'Nhân viên CH', email: `${role.toLowerCase()}@demo.local`, passwordHash, role })));
  const categories = await Category.create([{name:'Âm thanh',slug:'am-thanh'},{name:'Bàn phím',slug:'ban-phim'},{name:'Màn hình',slug:'man-hinh'},{name:'Phụ kiện',slug:'phu-kien'}]);
  const photos = {
    headphones: '/images/hero-headphones.png',
    keyboard: '/images/keyboard.jpg',
    screen: '/images/monitor.jpg',
    mouse: '/images/mouse.jpg',
  };
  const rows: [string, string, number, number, number, string, string][] = [
    ['Tai nghe Studio 01','CH-AUD-01',2490000,18,0,photos.headphones,'Thiết bị mẫu cho bản trải nghiệm. Tai nghe over-ear thiết kế gọn, sắc graphite. Ảnh ý tưởng, không đại diện hàng hóa thực.'],
    ['Bàn phím Mechanical 75','CH-KEY-01',1690000,12,1,photos.keyboard,'Thiết bị mẫu. Layout gọn 75%, hoàn thiện màu sáng cho góc làm việc.'],
    ['Màn hình Workspace 27','CH-DSP-01',5990000,5,2,photos.screen,'Thiết bị mẫu. Màn hình 27 inch cho làm việc và giải trí.'],
    ['Chuột Everyday Wireless','CH-ACC-01',690000,24,3,photos.mouse,'Thiết bị mẫu. Chuột không dây tối giản cho sử dụng hằng ngày.'],
    ['Tai nghe Studio 02','CH-AUD-02',3290000,8,0,photos.headphones,'Thiết bị mẫu thuộc bộ sưu tập âm thanh.'],
    ['Bàn phím Mechanical Mini','CH-KEY-02',1290000,10,1,photos.keyboard,'Thiết bị mẫu. Kích thước gọn cho bàn làm việc nhỏ.'],
    ['Màn hình Workspace 24','CH-DSP-02',3990000,0,2,photos.screen,'Thiết bị mẫu hiện tạm hết hàng, dùng để kiểm tra trạng thái tồn kho.'],
    ['Chuột Precision','CH-ACC-02',990000,15,3,photos.mouse,'Thiết bị mẫu dành cho bản trải nghiệm.'],
  ];
  // Deterministic timestamps make catalog order stable in UI verification.
  // Fictional brands belong only to this disposable demo database.
  const demoBrands = ['Studio Demo', 'Mechanical Demo', 'Workspace Demo', 'Everyday Demo'];
  for (const [i, row] of rows.entries()) { const [name,sku,price,stock,category,imageUrl,description] = row; await Product.create({name,sku,price,stock,categoryId:categories[category as number]!._id,imageUrl,description,brand:demoBrands[category],createdAt:new Date(Date.now()-i*1000)}); }
  const port = Number(process.env.DEMO_PORT || 5001);
  const server = app.listen(port, '127.0.0.1', () => console.log(`Isolated demo API ready at http://127.0.0.1:${port}. Demo accounts: customer@demo.local, staff@demo.local, admin@demo.local / DemoCommerce!2026`));
  const stop = async () => { server.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch(error => { console.error(error); process.exit(1); });
