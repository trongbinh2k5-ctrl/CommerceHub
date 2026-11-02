require("dotenv").config();

const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri);

  try {
    const result = await mongoose.connection.collection("products").updateMany(
      {
        stock: { $exists: false },
      },
      {
        $set: { stock: 0 },
      },
    );

    console.log(`Migrated ${result.modifiedCount} products`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
