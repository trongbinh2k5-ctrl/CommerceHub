import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import {
  getMyAddresses,
  addAddress,
  editAddress,
  makeDefaultAddress,
  removeAddress,
} from "./address.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.get("/", getMyAddresses);
router.post("/", addAddress);
router.patch("/:id", editAddress);
router.patch("/:id/default", makeDefaultAddress);
router.delete("/:id", removeAddress);

export default router;
