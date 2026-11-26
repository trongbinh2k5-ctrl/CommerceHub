import { Request, Response, NextFunction } from "express";
import { registerUser, loginUser } from "./auth.service";
import { startLoginSession, registrationVerification } from './account.service';
import { emailAvailable, verificationRequired } from './mail.service';
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fullName, email, password } = req.body ?? {};

    if (
      typeof fullName !== "string" ||
      !fullName.trim() ||
      fullName.trim().length > 100 ||
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid registration data",
      });
      return;
    }

    if (verificationRequired() && !emailAvailable()) {
      res.status(503).json({ success: false, message: 'Dịch vụ xác minh email chưa được cấu hình.' });
      return;
    }
    const user = await registerUser({
      fullName,
      email,
      password,
    });

    const emailSent = await registrationVerification(user.id);
    res.status(201).json({
      success: true,
      message: verificationRequired() && !emailSent ? 'Tài khoản đã tạo. Chưa gửi được email xác minh, vui lòng yêu cầu gửi lại.' : 'Đã tạo tài khoản.',
      data: { ...user, emailVerified: false, verificationRequired: verificationRequired(), emailSent },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({
        success: false,
        message: "Email already exists",
      });
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "Email already exists",
      });
      return;
    }

    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      email.length > 254 ||
      typeof password !== "string" ||
      !password ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    const user = await loginUser({
      email,
      password,
    });

    const session = await startLoginSession(req, res, user.id, user.authVersion);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        ...session,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    next(error);
  }
};
