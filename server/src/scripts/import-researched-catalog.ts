import 'dotenv/config';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Product } from '../modules/products/product.model';
import { Category } from '../modules/categories/category.model';
import { parseProductDetails } from '../modules/products/product-details';
import { isValidProductImage } from '../modules/products/product-image';

type CategoryRow = { slug: string; name: string; description: string };
type ExistingRow = { id: string; sku: string; brand: string; modelName: string; categorySlug: string };
type ProductRow = Record<string, unknown> & { sku: string; name: string; categorySlug: string; price: number; stock: number; imageUrl: string; gallery: string[]; assets: unknown[] };
type Plan = { checked: string; categories: CategoryRow[]; products: ProductRow[]; existing: ExistingRow[] };

async function main() {
  const argument = process.argv.find(value => value.startsWith('--plan='));
  const planPath = path.resolve(argument?.slice(7) || 'data/researched-catalog-2026-11-07.json');
  const plan: Plan = JSON.parse(await readFile(planPath, 'utf8'));
  if (!plan.categories?.length || !plan.products?.length || !Array.isArray(plan.existing)) throw new Error('Invalid catalog plan');
  if (new Set(plan.categories.map(row => row.slug)).size !== plan.categories.length || new Set(plan.products.map(row => row.sku)).size !== plan.products.length) throw new Error('Duplicate category/SKU in plan');
  const slugs = new Set(plan.categories.map(row => row.slug));
  for (const row of plan.products) {
    if (!row.sku || !row.name || !slugs.has(row.categorySlug) || row.price !== 0 || row.stock !== 0) throw new Error('Research imports must have zero unconfirmed store price and stock');
    parseProductDetails(row);
    for (const image of [row.imageUrl, ...row.gallery]) {
      if (!isValidProductImage(image) || !image.startsWith('/images/catalog-2026-11/')) throw new Error('Invalid local catalog image');
      const resolved = path.resolve('../client/public', image.slice(1));
      const root = path.resolve('../client/public/images/catalog-2026-11') + path.sep;
      if (!resolved.startsWith(root)) throw new Error('Image path escapes catalog directory');
      await stat(resolved);
    }
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    const categories = await Category.find({ slug: { $in: [...slugs] } }).lean();
    const products = await Product.find({ $or: [{ sku: { $in: plan.products.map(row => row.sku) } }, { _id: { $in: plan.existing.map(row => row.id) } }] }).lean();
    for (const row of plan.existing) {
      const current = products.find(product => String(product._id) === row.id);
      if (!current || current.sku !== row.sku || !current.isActive) throw new Error(`Existing product changed or missing: ${row.id}`);
    }
    if (categories.some(category => !category.isActive)) throw new Error('An intended category is hidden; import will not unhide it');
    const newProducts = plan.products.filter(row => !products.some(product => product.sku === row.sku));
    const newCategories = plan.categories.filter(row => !categories.some(category => category.slug === row.slug));
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', newCategories: newCategories.map(row => row.name), newProducts: newProducts.map(row => row.name), existingMetadata: plan.existing.map(row => ({ id: row.id, brand: row.brand, category: row.categorySlug })), preserved: ['existing prices', 'all stock', 'hidden products and categories', 'accounts', 'orders'] }, null, 2));
    if (!process.argv.includes('--apply')) return;
    const backupDirectory = path.resolve('../.local/catalog-backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `${Date.now()}-before.json`);
    await writeFile(backupPath, JSON.stringify({ categories, products, plannedNewSkus: newProducts.map(row => row.sku), plannedNewSlugs: newCategories.map(row => row.slug) }, null, 2));
    const created: { categories: string[]; products: string[] } = { categories: [], products: [] };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        created.categories = []; created.products = [];
        const ids = new Map<string, mongoose.Types.ObjectId>();
        for (const row of plan.categories) {
          const current = await Category.findOne({ slug: row.slug }).session(session);
          if (current) {
            if (!current.isActive) throw new Error('Category hidden concurrently');
            const before = categories.find(item => item.slug === row.slug);
            if (!before || current.updatedAt.getTime() !== before.updatedAt.getTime()) throw new Error('Category changed concurrently');
            current.name = row.name; current.description = row.description; await current.save({ session });
            ids.set(row.slug, current._id);
          } else {
            const [category] = await Category.create([{ ...row, isActive: true }], { session });
            ids.set(row.slug, category!._id); created.categories.push(String(category!._id));
          }
        }
        for (const row of newProducts) {
          const { categorySlug, assets: _assets, ...data } = row;
          const [product] = await Product.create([{ ...data, categoryId: ids.get(categorySlug) }], { session });
          created.products.push(String(product!._id));
        }
        for (const row of plan.existing) {
          const before = products.find(product => String(product._id) === row.id)!;
          const result = await Product.updateOne({ _id: row.id, sku: row.sku, updatedAt: before.updatedAt }, { $set: { brand: row.brand, modelName: row.modelName, categoryId: ids.get(row.categorySlug) } }, { session, runValidators: true });
          if (result.matchedCount !== 1) throw new Error('Product changed concurrently; transaction rolled back');
        }
      });
    } finally { await session.endSession(); }
    const receipt = backupPath.replace('-before.json', '-receipt.json');
    await writeFile(receipt, JSON.stringify({ checked: plan.checked, created, updatedProductIds: plan.existing.map(row => row.id), backupPath }, null, 2));
    console.log(JSON.stringify({ imported: created.products.length, categoriesCreated: created.categories.length, backupPath, receipt }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
