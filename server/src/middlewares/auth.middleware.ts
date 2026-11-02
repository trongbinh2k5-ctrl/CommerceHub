import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { isObjectIdOrHexString } from "mongoose";
import { User } from "../modules/auth/user.model";

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

    req.user = {
      userId: user.id,
      role: user.role,
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
