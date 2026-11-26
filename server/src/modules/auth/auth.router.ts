import { Router } from "express";
import { register, login } from "./auth.controller";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { getProfile, updateProfile, refreshLogin, endLogin, sameOrigin, requestEmail, consumeChallenge, changePassword, requestEmailChange, listSessions, revokeSession } from './account.service';
import { emailAvailable, verificationRequired } from './mail.service';
import { createRequestLimiter } from '../../middlewares/security.middleware';
const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get('/options', (_req, res) => { res.json({ success: true, data: { emailDeliveryAvailable: emailAvailable(), verificationRequired: verificationRequired() } }); });
router.post('/refresh', sameOrigin, refreshLogin);
router.post('/logout', sameOrigin, endLogin);
router.post('/forgot-password', createRequestLimiter(5, 15 * 60000), (req, res) => requestEmail(req, res, 'RESET_PASSWORD'));
router.post('/resend-verification', createRequestLimiter(5, 15 * 60000), (req, res) => requestEmail(req, res, 'VERIFY_EMAIL'));
router.post('/reset-password', createRequestLimiter(10, 15 * 60000), (req, res) => consumeChallenge(req, res, true));
router.post('/verify-email', createRequestLimiter(10, 15 * 60000), (req, res) => consumeChallenge(req, res, false));
router.patch('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, createRequestLimiter(5, 15 * 60000), changePassword);
router.post('/email-change', authenticate, createRequestLimiter(5, 15 * 60000), requestEmailChange);
router.get('/sessions', authenticate, listSessions);
router.delete('/sessions/:id', authenticate, revokeSession);

router.get('/me', authenticate, getProfile);
router.get("/admin-only", authenticate, authorize("ADMIN"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome Admin",
  });
});
export default router;
