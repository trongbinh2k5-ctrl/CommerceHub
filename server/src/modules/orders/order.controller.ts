import { Request, Response, NextFunction } from "express";

import {
  OrderError,
  isValidOrderId,
  createOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
  getAllOrders,
  updateOrderStatus,
} from "./order.service";

import { isValidIdempotencyKey } from "./checkout-idempotency";

import { OrderStatus } from "./order.model";

const handleOrderError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof OrderError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    const err = error as { statusCode: number; message: string };
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  next(error);
};

// POST /api/orders
export const createMyOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { addressId, couponCode } = req.body ?? {};

    const checkoutKey = req.get("Idempotency-Key");

    if (!isValidOrderId(addressId)) {
      res.status(400).json({
        success: false,
        message: "Invalid addressId",
      });
      return;
    }

    if (!isValidIdempotencyKey(checkoutKey)) {
      res.status(400).json({
        success: false,
        message:
          "Idempotency-Key must contain 16-128 letters, digits, underscores or hyphens",
      });
      return;
    }

    const { order, replayed } = await createOrder(
      req.user!.userId,
      addressId,
      checkoutKey,
      couponCode,
    );

    res.status(replayed ? 200 : 201).json({
      success: true,
      message: replayed
        ? "Existing order returned"
        : "Order created successfully",
      data: order,
    });
  } catch (error) {
    handleOrderError(error, res, next);
  }
};

// GET /api/orders
export const getMyOrderList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orders = await getMyOrders(req.user!.userId);

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    handleOrderError(error, res, next);
  }
};

// GET /api/orders/:id
export const getMyOrderDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    if (!isValidOrderId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
      return;
    }

    const order = await getMyOrderById(req.user!.userId, id);

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    handleOrderError(error, res, next);
  }
};

// PATCH /api/orders/:id/cancel
export const cancelMyOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    if (!isValidOrderId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
      return;
    }

    const order = await cancelMyOrder(req.user!.userId, id);

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    handleOrderError(error, res, next);
  }
};

// GET /api/admin/orders
export const getAdminOrderList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orders = await getAllOrders();

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    handleOrderError(error, res, next);
  }
};

// PATCH /api/admin/orders/:id/status
export const changeOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};

    const actorId = req.user?.userId;
    if (!actorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!isValidOrderId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
      return;
    }

    if (
      typeof status !== "string" ||
      !Object.values(OrderStatus).includes(status as OrderStatus)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
      return;
    }

    const order = await updateOrderStatus(id, status as OrderStatus, actorId);

    res.json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error) {
    handleOrderError(error, res, next);
  }
};
