import { Router } from "express";
import { register, login } from "./auth.controller";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
const router = Router();

router.post("/register", register);
router.post("/login", login);

router.get("/me", authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Authenticated user",
    data: {
      userId: req.user?.userId,
      role: req.user?.role,
    },
  });
});
router.get("/admin-only", authenticate, authorize("ADMIN"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome Admin",
  });
});
export default router;
