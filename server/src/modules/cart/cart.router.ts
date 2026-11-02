import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import {
  getMyCart,
  addItem,
  updateItem,
  deleteItem,
  deleteAllItems,
} from "./cart.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.get("/", getMyCart);
router.post("/items", addItem);
router.patch("/items/:productId", updateItem);
router.delete("/items/:productId", deleteItem);
router.delete("/", deleteAllItems);

export default router;

