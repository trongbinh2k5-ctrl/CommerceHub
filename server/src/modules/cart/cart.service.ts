import { isValidObjectId, Types } from "mongoose";
import { Cart } from "./cart.model";
import { Product } from "../products/product.model";
import { Category } from "../categories/category.model";

type CartResult =
  | { status: "SUCCESS" }
  | { status: "NOT_FOUND" }
  | { status: "UNAVAILABLE" }
  | { status: "LIMIT_EXCEEDED" };

export const isValidCartProductId = (id: unknown): id is string =>
  typeof id === "string" && isValidObjectId(id);

export const isValidQuantity = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= 99;

const findAvailableProduct = async (productId: string) => {
  const product = await Product.findOne({
    _id: productId,
    isActive: true,
  });

  if (!product) return null;

  if (product.categoryId) {
    const category = await Category.findOne({
      _id: product.categoryId,
      isActive: true,
    });

    if (!category) return null;
  }

  return product;
};

export const getCart = async (userId: string) => {
  const cart = await Cart.findOne({ userId });

  if (!cart) {
    return {
      version: 0,
      items: [],
      totalQuantity: 0,
      totalAmount: 0,
      unavailableCount: 0,
    };
  }

  const productIds = cart.items.map((item) => item.productId);

  const products = await Product.find({
    _id: { $in: productIds },
  });

  const productMap = new Map(
    products.map((product) => [product._id.toString(), product]),
  );

  const categoryIds = products
    .filter((product) => product.categoryId)
    .map((product) => product.categoryId);

  const activeCategories = await Category.find({
    _id: { $in: categoryIds },
    isActive: true,
  }).select("_id");

  const activeCategoryIds = new Set(
    activeCategories.map((category) => category._id.toString()),
  );

  let totalQuantity = 0;
  let totalAmount = 0;
  let unavailableCount = 0;

  const items = cart.items.map((item) => {
    const product = productMap.get(item.productId.toString());

    const available = Boolean(
      product?.isActive &&
      (!product.categoryId ||
        activeCategoryIds.has(product.categoryId.toString())),
    );

    if (!available) {
      unavailableCount += 1;
    }

    const price = product?.price ?? null;
    const subtotal = available && price !== null ? price * item.quantity : null;

    if (available && subtotal !== null) {
      totalQuantity += item.quantity;
      totalAmount += subtotal;
    }

    return {
      productId: item.productId.toString(),
      name: product?.name ?? null,
      price,
      quantity: item.quantity,
      subtotal,
      available,
    };
  });

  return {
    version: cart.__v,
    items,
    totalQuantity,
    totalAmount,
    unavailableCount,
  };
};

export const addCartItem = async (
  userId: string,
  productId: string,
  quantity: number,
): Promise<CartResult> => {
  const product = await findAvailableProduct(productId);

  if (!product) {
    return { status: "UNAVAILABLE" };
  }

  let cart = await Cart.findOne({ userId });

  if (!cart) {
    cart = new Cart({
      userId: new Types.ObjectId(userId),
      items: [],
    });
  }

  const existingItem = cart.items.find(
    (item) => item.productId.toString() === productId,
  );

  if (existingItem) {
    if (existingItem.quantity + quantity > 99) {
      return { status: "LIMIT_EXCEEDED" };
    }

    existingItem.quantity += quantity;
  } else {
    cart.items.push({
      productId: new Types.ObjectId(productId),
      quantity,
    });
  }

  await cart.save();

  return { status: "SUCCESS" };
};

export const updateCartItem = async (
  userId: string,
  productId: string,
  quantity: number,
): Promise<CartResult> => {
  const cart = await Cart.findOne({ userId });

  if (!cart) return { status: "NOT_FOUND" };

  const item = cart.items.find(
    (entry) => entry.productId.toString() === productId,
  );

  if (!item) return { status: "NOT_FOUND" };

  const product = await findAvailableProduct(productId);

  if (!product) return { status: "UNAVAILABLE" };

  item.quantity = quantity;
  await cart.save();

  return { status: "SUCCESS" };
};

export const removeCartItem = async (
  userId: string,
  productId: string,
): Promise<CartResult> => {
  const cart = await Cart.findOne({ userId });

  if (!cart) return { status: "NOT_FOUND" };

  const index = cart.items.findIndex(
    (item) => item.productId.toString() === productId,
  );

  if (index === -1) return { status: "NOT_FOUND" };

  cart.items.splice(index, 1);
  await cart.save();

  return { status: "SUCCESS" };
};

export const clearCart = async (userId: string): Promise<void> => {
  const cart = await Cart.findOne({ userId });

  if (!cart) return;

  if (cart.items.length === 0) return;

  cart.items.splice(0, cart.items.length);

  await cart.save();
};
