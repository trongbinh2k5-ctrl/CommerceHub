import type { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

export function createRequestLimiter(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again later." },
  });
}

export function installSecurity(app: Express) {
  app.disable("x-powered-by");
  // Trust only explicitly configured proxy addresses/subnets, never arbitrary headers.
  const proxies = process.env.TRUSTED_PROXIES?.split(",").map(v => v.trim()).filter(Boolean);
  if (proxies?.length) app.set("trust proxy", proxies);
  app.use(helmet({ strictTransportSecurity: process.env.NODE_ENV === "production" ? undefined : false }));
  const origins = new Set((process.env.CORS_ORIGINS ?? "").split(",").map(v => v.trim()).filter(Boolean));
  app.use(cors({
    origin: (origin, callback) => callback(null, !!origin && origins.has(origin)),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    exposedHeaders: ["RateLimit", "Retry-After"],
    maxAge: 600,
  }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", createRequestLimiter(300, 60_000));
  // Count all attempts so successful requests cannot be used to bypass the budget.
  app.use("/api/auth/login", createRequestLimiter(20, 15 * 60_000));
  app.use("/api/auth/register", createRequestLimiter(10, 60 * 60_000));
}
