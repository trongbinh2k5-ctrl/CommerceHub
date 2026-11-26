import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from '../modules/products/product.model';
import { Category } from '../modules/categories/category.model';
import { StockMovement } from '../modules/operations/operations.models';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Không bổ sung tồn kho thử nghiệm trong production.');
  if (!process.env.MONGODB_URI) throw new Error('Thiếu cấu hình MongoDB.');
  await mongoose.connect(process.env.MONGODB_URI);
  const categories=await Category.find({isActive:true}).distinct('_id');
  const filter={isActive:true,categoryId:{$in:[null,...categories]},price:{$gt:0},stock:{$lt:100}};
  if (!process.argv.includes('--apply')) {
    const rows=await Product.find(filter).select('sku name stock').lean();
    console.log(`Sản phẩm đang bán có giá, tồn dưới 100: ${rows.length}`);
    console.log(JSON.stringify(rows.map(p=>({sku:p.sku,name:p.name,before:p.stock,after:100})),null,2));
    console.log('Chưa thay đổi dữ liệu. Dùng --apply để nâng tồn các sản phẩm này lên 100.');
    return;
  }
  await StockMovement.init();
  const session=await mongoose.startSession();
  try {
    const result=await session.withTransaction(async()=>{
      const rows=await Product.find(filter).session(session);
      let added=0;
      for(const p of rows){
        const delta=100-p.stock;
        const updated=await Product.updateOne({_id:p._id,stock:p.stock,isActive:true,price:{$gt:0}},{$inc:{stock:delta}},{session,runValidators:true});
        if(updated.modifiedCount!==1)throw new Error('Tồn kho đã thay đổi đồng thời, cần chạy lại.');
        await StockMovement.create([{productId:p._id,delta,before:p.stock,after:100,reason:'Bổ sung tồn kho để chủ dự án kiểm thử mua hàng — 17/11/2026.'}],{session});
        added+=delta;
      }
      return {products:rows.length,added};
    });
    console.log(JSON.stringify(result));
    console.log(`Số sản phẩm đủ điều kiện vẫn dưới 100 sau cập nhật: ${await Product.countDocuments(filter)}`);
  } finally {await session.endSession();}
}
main().catch(()=>{console.error('Không hoàn tất bổ sung tồn kho. Kiểm tra kết nối/cấu hình hoặc thay đổi đồng thời; không in thông tin kết nối.');process.exitCode=1;}).finally(()=>mongoose.disconnect());
