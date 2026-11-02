import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import {
  addCategory,
  getCategories,
  getAdminCategories,
  editCategory,
  hideCategory,
  reactivateCategory,
} from "./category.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));
router.patch("/:id", editCategory);
router.post("/", addCategory);
router.get("/", getAdminCategories);
router.delete("/:id", hideCategory);

router.patch("/:id/restore", reactivateCategory);
export default router;
