import type { Request, Response, NextFunction } from "express";

import {
  ShippingError,
  createShipment,
  updateShipmentStatus,
  getMyShipments,
  getMyShipmentByOrder,
  getAdminShipment,
  getAdminShipments,
} from "./shipping.service";

const run =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

const currentUserId = (req: Request): string => {
  const id = req.user?.userId;

  if (!id) {
    throw new ShippingError("Authentication required", 401);
  }

  return id;
};

const pathParam = (value: string | string[] | undefined): string => {
  if (typeof value !== "string") {
    throw new ShippingError("Invalid path parameter", 400);
  }

  return value;
};

export const createAdminShipment = run(async (req, res) => {
  const { orderId, carrier, trackingCode, carrierFee } = req.body ?? {};

  const shipment = await createShipment(
    {
      orderId,
      carrier,
      trackingCode,
      carrierFee,
    },
    currentUserId(req),
  );

  res.status(201).json({
    message: "Shipment created",
    shipment,
  });
});

export const changeAdminShipmentStatus = run(async (req, res) => {
  const { status, note } = req.body ?? {};

  const shipment = await updateShipmentStatus(
    pathParam(req.params.id),
    { status, note },
    currentUserId(req),
  );

  res.status(200).json({
    message: "Shipment status processed",
    shipment,
  });
});

export const listAdminShipments = run(async (req, res) => {
  res.status(200).json(await getAdminShipments(req.query));
});

export const detailAdminShipment = run(async (req, res) => {
  res.status(200).json({
    shipment: await getAdminShipment(pathParam(req.params.id)),
  });
});

export const listMyShipments = run(async (req, res) => {
  res
    .status(200)
    .json(
      await getMyShipments(currentUserId(req), req.query.page, req.query.limit),
    );
});

export const detailMyShipment = run(async (req, res) => {
  res.status(200).json({
    shipment: await getMyShipmentByOrder(
      currentUserId(req),
      pathParam(req.params.orderId),
    ),
  });
});
