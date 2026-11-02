import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase } from "../config/database";

import {
  Order,
  OrderStatus,
  PaymentMethod,
} from "../modules/orders/order.model";

import { Payment, PaymentStatus } from "../modules/payments/payment.model";

const apply = process.argv.includes("--apply");

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

const main = async () => {
  await connectDatabase();

  const stats = {
    scanned: 0,
    existing: 0,
    created: 0,
    wouldCreate: 0,
    invalid: 0,
    errors: 0,
    deliveredPendingReview: 0,
  };

  console.log(apply ? "MODE: APPLY" : "MODE: DRY RUN");

  if (apply) {
    // Ensure the unique payment index exists
    // before performing upserts.
    await Payment.createIndexes();
  }

  const cursor = Order.find().sort({ _id: 1 }).cursor();

  for await (const order of cursor) {
    stats.scanned++;

    try {
      const existing = await Payment.findOne({
        orderId: order._id,
      });

      if (existing) {
        const matches =
          String(existing.userId) === String(order.userId) &&
          existing.method === order.paymentMethod &&
          existing.amount === order.totalAmount;

        if (!matches) {
          stats.invalid++;
          console.error(`MISMATCH order=${order._id}`);
        } else {
          stats.existing++;
        }

        continue;
      }

      if (
        !Number.isSafeInteger(order.totalAmount) ||
        order.totalAmount < 0 ||
        order.paymentMethod !== PaymentMethod.COD
      ) {
        stats.invalid++;
        console.error(`INVALID order=${order._id}`);
        continue;
      }

      const status =
        order.status === OrderStatus.CANCELLED
          ? PaymentStatus.CANCELLED
          : PaymentStatus.PENDING;

      if (order.status === OrderStatus.DELIVERED) {
        stats.deliveredPendingReview++;
      }

      if (!apply) {
        stats.wouldCreate++;
        console.log(
          `WOULD CREATE payment for order=${order._id}, status=${status}`,
        );
        continue;
      }

      const result = await Payment.updateOne(
        {
          orderId: order._id,
        },
        {
          $setOnInsert: {
            orderId: order._id,
            userId: order.userId,
            method: order.paymentMethod,
            amount: order.totalAmount,
            status,
          },
        },
        {
          upsert: true,
          runValidators: true,
        },
      );

      if (result.upsertedCount === 1) {
        stats.created++;
      } else {
        stats.existing++;
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // Another process may have inserted
        // the payment. Verify on a later run.
        stats.errors++;
        console.error(`CONCURRENT INSERT order=${order._id}`);
        continue;
      }

      stats.errors++;
      console.error(`ERROR order=${order._id}`, error);
    }
  }

  console.log("\nMigration summary:");
  console.table(stats);

  if (stats.errors > 0 || stats.invalid > 0) {
    process.exitCode = 1;
  }

  if (stats.deliveredPendingReview > 0) {
    console.warn(
      "Delivered legacy orders require manual COD reconciliation. They were not automatically marked PAID.",
    );
  }
};

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
