import "dotenv/config";
import app from "./app";
import { connectDatabase } from "./config/database";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes");
    }
    if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS?.trim()) {
      throw new Error("CORS_ORIGINS must be configured in production");
    }
    await connectDatabase();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
