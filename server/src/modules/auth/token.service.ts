import jwt from "jsonwebtoken";

type AccessTokenPayload = {
  userId: string;
  role: "CUSTOMER" | "STAFF" | "ADMIN";
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
    },
    secret,
    {
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );
};
