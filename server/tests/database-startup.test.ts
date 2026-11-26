import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
// Register the same models that index.ts loads before connecting.
import "../src/app";
import { connectDatabase } from "../src/config/database";
import { Order } from "../src/modules/orders/order.model";
import { Payment } from "../src/modules/payments/payment.model";
import { Shipment } from "../src/modules/shipping/shipping.model";
import { Review } from "../src/modules/reviews/review.model";

test("database startup prepares critical uniqueness constraints before serving requests", { timeout: 120000 }, async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const previousUri = process.env.MONGODB_URI;
  try {
    process.env.MONGODB_URI = mongo.getUri("startup_constraints");
    await connectDatabase();
    for (const [collection, key] of [
      [Order.collection, { userId: 1, checkoutKey: 1 }],
      [Payment.collection, { orderId: 1 }],
      [Shipment.collection, { orderId: 1 }],
      [Shipment.collection, { trackingCode: 1 }],
      [Review.collection, { userId: 1, productId: 1 }],
    ] as const) {
      const indexes = await collection.indexes();
      assert.ok(indexes.some(index => index.unique === true && JSON.stringify(index.key) === JSON.stringify(key)), `Missing unique constraint on ${collection.collectionName}: ${JSON.stringify(key)}`);
    }
    const orderId = new mongoose.Types.ObjectId();
    const payments = mongoose.connection.collection(Payment.collection.collectionName);
    await payments.insertOne({ orderId });
    await assert.rejects(payments.insertOne({ orderId }), (error: unknown) => (error as { code?: number }).code === 11000);
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    await mongoose.disconnect();
    await mongo.stop();
  }
});
