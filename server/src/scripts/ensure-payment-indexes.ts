import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase } from "../config/database";

import { Order } from "../modules/orders/order.model";

import { Payment } from "../modules/payments/payment.model";

const main = async () => {
  await connectDatabase();

  console.log("Creating Order indexes...");
  await Order.createIndexes();

  console.log("Creating Payment indexes...");
  await Payment.createIndexes();

  console.log("Required indexes created successfully");
};

main()
  .catch((error) => {
    console.error("Index creation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
