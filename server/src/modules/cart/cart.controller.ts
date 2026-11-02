import { Request, Response, NextFunction } from "express";
import { Error as MongooseError } from "mongoose";
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  isValidCartProductId,
  isValidQuantity,
} from "./cart.service";

type OperationResult = {
  status: "SUCCESS" | "NOT_FOUND" | "UNAVAILABLE" | "LIMIT_EXCEEDED";
};

const handleResult = (
  result: OperationResult,
  res: Response,
  successMessage: string,
) => {
  switch (result.status) {
    case "NOT_FOUND":
      res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
      return;

    case "UNAVAILABLE":
      res.status(409).json({
        success: false,
        message: "Product is unavailable",
      });
      return;

    case "LIMIT_EXCEEDED":
      res.status(400).json({
        success: false,
        message: "Maximum quantity is 99",
      });
      return;

    default:
      res.json({
        success: true,
        message: successMessage,
      });
  }
};

const handleCartError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof MongooseError.VersionError) {
    res.status(409).json({
      success: false,
      message: "Cart was modified. Please retry",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) {
    res.status(409).json({
      success: false,
      message: "Cart was created concurrently. Please retry",
    });
    return;
  }

  next(error);
};

export const getMyCart = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cart = await getCart(req.user!.userId);

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

export const addItem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { productId, quantity } = req.body ?? {};

    if (!isValidCartProductId(productId) || !isValidQuantity(quantity)) {
      res.status(400).json({
        success: false,
        message: "Invalid productId or quantity",
      });
      return;
    }

    const result = await addCartItem(req.user!.userId, productId, quantity);

    handleResult(result, res, "Product added to cart");
  } catch (error) {
    handleCartError(error, res, next);
  }
};

export const updateItem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body ?? {};

    if (
      typeof productId !== "string" ||
      !isValidCartProductId(productId) ||
      !isValidQuantity(quantity)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid productId or quantity",
      });
      return;
    }

    const result = await updateCartItem(req.user!.userId, productId, quantity);

    handleResult(result, res, "Cart item updated");
  } catch (error) {
    handleCartError(error, res, next);
  }
};

export const deleteItem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { productId } = req.params;

    if (typeof productId !== "string" || !isValidCartProductId(productId)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    const result = await removeCartItem(req.user!.userId, productId);

    handleResult(result, res, "Product removed from cart");
  } catch (error) {
    handleCartError(error, res, next);
  }
};

export const deleteAllItems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await clearCart(req.user!.userId);

    res.json({
      success: true,
      message: "Cart cleared",
    });
  } catch (error) {
    handleCartError(error, res, next);
  }
};
