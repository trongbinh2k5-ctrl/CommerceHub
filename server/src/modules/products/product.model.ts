import { Schema, model } from "mongoose";
import { isValidProductImage } from "./product-image";

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Stock must be a safe integer",
      },
    },

    description: {
      type: String,
      default: "",
    },

    imageUrl: { type: String, default: "", validate: isValidProductImage },
    brand: { type: String, default: '', maxlength: 160 },
    modelName: { type: String, default: '', maxlength: 160 },
    condition: { type: String, default: '', maxlength: 160 },
    warrantyText: { type: String, default: '', maxlength: 2000 },
    origin: { type: String, default: '', maxlength: 160 },
    bundle: { type: String, default: '', maxlength: 2000 },
    variantGroup: { type: String, default: '', maxlength: 160, index: true },
    variantLabel: { type: String, default: '', maxlength: 160 },
    gallery: { type: [String], default: [], validate: { validator: (items: string[]) => items.length <= 12 && items.every(v => v !== '' && isValidProductImage(v)), message: 'Invalid product gallery' } },
    specifications: { type: [new Schema({ label: { type: String, required: true, maxlength: 100 }, value: { type: String, required: true, maxlength: 500 } }, { _id: false })], default: [] },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Product = model("Product", productSchema);
