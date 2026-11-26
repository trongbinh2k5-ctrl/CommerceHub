import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(mongoUri);

  // Do not accept requests until every registered model's collections and
  // unique constraints are ready (checkout, payments, shipments and reviews).
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));

  console.log("MongoDB connected successfully");
};
