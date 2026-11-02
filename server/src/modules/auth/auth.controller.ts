import { Request, Response, NextFunction } from "express";
import { registerUser, loginUser } from "./auth.service";
import { generateAccessToken } from "./token.service";
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

    const user = await registerUser({
      fullName,
      email,
      password,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: user,
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

    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user,
        accessToken,
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
