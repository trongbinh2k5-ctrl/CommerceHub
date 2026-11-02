import "dotenv/config";

import mongoose from "mongoose";

import { Review } from "./review.model";

const main = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(mongoUri);

  try {
    // Build indexes declared in review.model.ts.
    await Review.createIndexes();

    const indexes = await Review.collection.indexes();

    console.log("Review indexes created successfully");

    for (const index of indexes) {
      console.log({
        name: index.name,
        key: index.key,
        unique: index.unique ?? false,
      });
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error("Review index setup failed:", error);
  process.exitCode = 1;
});
