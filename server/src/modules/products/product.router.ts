import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

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
