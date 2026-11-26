import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { Product } from './product.model';
import { Category } from '../categories/category.model';
import { getProductById } from './product.service';
import { isValidObjectId } from 'mongoose';

import {
  getProducts,
  addProduct,
  editProduct,
  deleteProduct,
  restoreDeletedProduct,
  getProductDetail,
} from "./product.controller";

const router = Router();

// Xem sản phẩm công khai
router.get("/", getProducts);
router.get('/facets', async (_req, res) => {
  const categories = await Category.find({ isActive: true }).distinct('_id');
  const brands = await Product.find({ isActive: true, $or: [{ categoryId: null }, { categoryId: { $in: categories } }], brand: { $nin: ['', null] } }).distinct('brand');
  res.json({ success: true, data: { brands: brands.sort() } });
});
for (const route of ['options', 'related']) router.get(`/:id/${route}`, async (req, res) => {
  if (!isValidObjectId(req.params.id)) { res.status(400).json({ message: 'Sản phẩm không hợp lệ.' }); return; }
  const p = await getProductById(String(req.params.id));
  if (!p) { res.status(404).json({ message: 'Không tìm thấy sản phẩm.' }); return; }
  if (route === 'options' && !p.variantGroup) { res.json({ success: true, data: [] }); return; }
  const categories = await Category.find({ isActive: true }).distinct('_id');
  const filter: any = { isActive: true, $or: [{ categoryId: null }, { categoryId: { $in: categories } }] };
  if (route === 'options') filter.variantGroup = p.variantGroup;
  else { filter._id = { $ne: p._id }; if (p.categoryId) filter.categoryId = p.categoryId._id; else if (p.brand) filter.brand = p.brand; }
  const data = await Product.find(filter).sort({ createdAt: -1, _id: -1 }).limit(route === 'options' ? 30 : 4);
  res.json({ success: true, data });
});
router.get("/:id", getProductDetail);

// Thêm sản phẩm
router.post("/", authenticate, authorize("STAFF", "ADMIN"), addProduct);

// Sửa sản phẩm
router.patch("/:id", authenticate, authorize("STAFF", "ADMIN"), editProduct);

// Ẩn sản phẩm (xóa mềm)
router.delete("/:id", authenticate, authorize("STAFF", "ADMIN"), deleteProduct);

// Khôi phục sản phẩm
router.patch(
  "/:id/restore",
  authenticate,
  authorize("STAFF", "ADMIN"),
  restoreDeletedProduct,
);

export default router;
