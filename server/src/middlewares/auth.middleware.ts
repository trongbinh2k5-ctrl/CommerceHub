import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { isObjectIdOrHexString } from "mongoose";
import { User } from "../modules/auth/user.model";
import { LoginSession } from '../modules/auth/account.models';
import { verificationRequired } from '../modules/auth/mail.service';
import { temporaryPasswordExpired } from '../modules/auth/account.service';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Access token is required",
    });
    return;
  }

  const token = authorization.slice(7);

  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    next(new Error("JWT_ACCESS_SECRET is missing"));
    return;
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    if (
      typeof decoded === "string" ||
      typeof decoded.sub !== "string" ||
      !isObjectIdOrHexString(decoded.sub) ||
      !["CUSTOMER", "STAFF", "ADMIN"].includes(decoded.role)
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid access token",
      });
      return;
    }

    const user = await User.findById(decoded.sub);

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: "Account is inactive or does not exist",
      });
      return;
    }
    if ((decoded.version ?? 0) !== (user.authVersion || 0) || (decoded.sid !== undefined &&
      (typeof decoded.sid !== 'string' || !isObjectIdOrHexString(decoded.sid) || !await LoginSession.exists({ _id: decoded.sid, userId: user._id, expiresAt: { $gt: new Date() }, authVersion: user.authVersion || 0 })))) {
      res.status(401).json({ success: false, message: 'Phiên đăng nhập đã bị thu hồi.' });
      return;
    }
    if (temporaryPasswordExpired(user)) {
      res.status(403).json({success:false,code:'TEMP_PASSWORD_EXPIRED',message:'Mật khẩu tạm đã hết hạn. Liên hệ admin để cấp lại.'});return;
    }
    const path=req.originalUrl.split('?')[0];
    const setupAllowed=(req.method==='GET'&&path==='/api/auth/me')||(req.method==='POST'&&path==='/api/auth/change-password');
    if(user.mustChangePassword && !setupAllowed){
      res.status(403).json({success:false,code:'PASSWORD_CHANGE_REQUIRED',message:'Bạn cần đổi mật khẩu trước khi sử dụng chức năng này.'});return;
    }
    if (verificationRequired() && !user.emailVerifiedAt && !user.mustChangePassword) {
      res.status(403).json({ success: false, message: 'Vui lòng xác minh email rồi đăng nhập lại.' });
      return;
    }

    req.user = {
      userId: user.id,
      role: user.role,
      sessionId: typeof decoded.sid === 'string' ? decoded.sid : undefined,
    };

    next();
  } catch (error: unknown) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
      return;
    }

    next(error);
  }
};
