import 'dotenv/config';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Product } from '../modules/products/product.model';
import { isValidProductImage } from '../modules/products/product-image';

type PhotoPlan = { id: string; expectedName: string; name: string; imageUrl: string; description?: string };

async function main() {
  const planArgument = process.argv.find(value => value.startsWith('--plan='));
  if (!planArgument) throw new Error('Pass --plan=<JSON file>; add --apply to save');
  const plan: PhotoPlan[] = JSON.parse(await readFile(path.resolve(planArgument.slice(7)), 'utf8'));
  if (!Array.isArray(plan) || !plan.length || new Set(plan.map(row => row.id)).size !== plan.length) throw new Error('Invalid photo plan');
  for (const row of plan) {
    if (!mongoose.isValidObjectId(row.id) || !row.expectedName || !row.name || !isValidProductImage(row.imageUrl) || !row.imageUrl.startsWith('/images/')) throw new Error('Invalid product/photo mapping');
    await stat(path.resolve(process.cwd(), '../client/public', row.imageUrl.slice(1)));
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const current = await Product.find({ _id: { $in: plan.map(row => row.id) } }).lean();
    if (current.length !== plan.length) throw new Error('A planned product is missing');
    const changes = plan.flatMap(row => {
      const product = current.find(value => String(value._id) === row.id)!;
      const completed = product.name === row.name && product.imageUrl === row.imageUrl && (row.description === undefined || product.description === row.description);
      if (completed) return [];
      if (product.name !== row.expectedName || product.imageUrl) throw new Error(`Product changed since planning: ${row.id}`);
      return [{ product, patch: { name: row.name, imageUrl: row.imageUrl, ...(row.description === undefined ? {} : { description: row.description }) } }];
    });
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', changes: changes.map(({ product, patch }) => ({ id: product._id, before: { name: product.name, imageUrl: product.imageUrl }, after: patch, preserved: { sku: product.sku, price: product.price, stock: product.stock, categoryId: product.categoryId } })) }, null, 2));
    if (!process.argv.includes('--apply') || !changes.length) return;
    const backupDirectory = path.resolve(process.cwd(), '../.local/product-photo-backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `${Date.now()}.json`);
    await writeFile(backupPath, JSON.stringify(current, null, 2) + '\n');
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const { product, patch } of changes) {
          const result = await Product.updateOne({ _id: product._id, name: product.name, updatedAt: product.updatedAt, $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }] }, { $set: patch }, { session, runValidators: true });
          if (result.modifiedCount !== 1) throw new Error('Product changed concurrently; no photo updates committed');
        }
      });
    } finally { await session.endSession(); }
    console.log(`Updated ${changes.length} products. Backup: ${backupPath}`);
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
