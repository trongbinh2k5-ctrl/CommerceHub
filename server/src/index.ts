import "dotenv/config";
import { startSepaySync } from './modules/payments/sepay-sync';
import {createApp} from "./app";
import {applyHostedDefaults} from './config/hosted-environment';
import { connectDatabase } from "./config/database";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    applyHostedDefaults();
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes");
    }
    if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS?.trim()) {
      throw new Error("CORS_ORIGINS must be configured in production");
    }
    await connectDatabase();
    startSepaySync();

    const server = createApp().listen(PORT, '0.0.0.0', () => {
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
