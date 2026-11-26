import jwt from "jsonwebtoken";

type AccessTokenPayload = {
  userId: string;
  role: "CUSTOMER" | "STAFF" | "ADMIN";
  authVersion?: number;
  sessionId?: string;
};

export const generateAccessToken = (data: AccessTokenPayload): string => {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is missing");
  }

  return jwt.sign(
    {
      sub: data.userId,
      role: data.role,
      version: data.authVersion ?? 0,
      ...(data.sessionId ? { sid: data.sessionId } : {}),
    },
    secret,
    {
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );
};
