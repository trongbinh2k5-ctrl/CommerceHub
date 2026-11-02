import { Request, Response, NextFunction } from "express";

import { isValidOrderId } from "../orders/order.service";

import {
  PaymentError,
  getMyPaymentByOrderId,
  getPaymentByOrderId,
  getAllPayments,
  confirmCodPayment,
} from "./payment.service";

const handlePaymentError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof PaymentError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  next(error);
};

// GET /api/payments/orders/:orderId
export const getMyPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { orderId } = req.params;

    if (!isValidOrderId(orderId)) {
      res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
      return;
    }

    const payment = await getMyPaymentByOrderId(req.user!.userId, orderId);

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    handlePaymentError(error, res, next);
  }
};

// GET /api/admin/payments
export const getAdminPayments = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payments = await getAllPayments();

    res.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    handlePaymentError(error, res, next);
  }
};

// GET /api/admin/payments/orders/:orderId
export const getAdminPaymentDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { orderId } = req.params;

    if (!isValidOrderId(orderId)) {
      res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
      return;
    }

    const payment = await getPaymentByOrderId(orderId);

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    handlePaymentError(error, res, next);
  }
};

// PATCH /api/admin/payments/orders/:orderId/confirm
export const confirmAdminCodPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { orderId } = req.params;

    if (!isValidOrderId(orderId)) {
      res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
      return;
    }

    const payment = await confirmCodPayment(orderId, req.user!.userId);

    res.json({
      success: true,
      message: "COD payment confirmed successfully",
      data: payment,
    });
  } catch (error) {
    handlePaymentError(error, res, next);
  }
};
