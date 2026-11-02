import "dotenv/config";

import mongoose from "mongoose";

import { Shipment } from "./shipping.model";

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const duplicateOrders = await Shipment.aggregate([
      {
        $group: {
          _id: "$orderId",
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
      { $limit: 5 },
    ]);

    const duplicateTracking = await Shipment.aggregate([
      {
        $group: {
          _id: "$trackingCode",
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
      { $limit: 5 },
    ]);

    if (duplicateOrders.length || duplicateTracking.length) {
      throw new Error("Duplicate shipments/tracking codes detected");
    }

    await Shipment.createIndexes();

    console.log("Shipment indexes created successfully");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
