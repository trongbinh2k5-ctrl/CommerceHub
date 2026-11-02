import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  AddressError,
  AddressInput,
  AddressUpdate,
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from "./address.service";

type AddressField = keyof AddressInput;

const requiredFields: AddressField[] = [
  "fullName",
  "phone",
  "province",
  "ward",
  "detail",
];

const allowedFields: AddressField[] = [...requiredFields, "label"];

const maxLengths: Record<AddressField, number> = {
  fullName: 100,
  phone: 15,
  province: 100,
  ward: 100,
  detail: 255,
  label: 50,
};

function validateInput(body: unknown, partial = false): AddressUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AddressError(400, "Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const keys = Object.keys(data);

  if (keys.length === 0) {
    throw new AddressError(400, "Request body is empty");
  }

  if (keys.some((key) => !allowedFields.includes(key as AddressField))) {
    throw new AddressError(400, "Unknown address field");
  }

  const result: AddressUpdate = {};

  for (const field of allowedFields) {
    const value = data[field];

    if (value === undefined) {
      if (!partial && requiredFields.includes(field)) {
        throw new AddressError(400, `${field} is required`);
      }

      continue;
    }

    if (typeof value !== "string" || value.trim().length > maxLengths[field]) {
      throw new AddressError(400, `Invalid ${field}`);
    }

    const normalized = value.trim();

    if (requiredFields.includes(field) && !normalized) {
      throw new AddressError(400, `${field} cannot be empty`);
    }

    if (field === "phone" && !/^0[0-9]{9}$/.test(normalized)) {
      throw new AddressError(400, "Invalid phone number");
    }

    result[field] = normalized;
  }

  return result;
}

function getAddressId(req: Request): string {
  const id = req.params.id;

  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new AddressError(400, "Invalid address ID");
  }

  return id;
}

function handleError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AddressError) {
    res.status(error.status).json({
      success: false,
      message: error.message,
    });
    return;
  }

  next(error);
}

export async function getMyAddresses(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await listAddresses(req.user!.userId);

    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function addAddress(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = validateInput(req.body) as AddressInput;

    const data = await createAddress(req.user!.userId, input);

    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function editAddress(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = getAddressId(req);
    const input = validateInput(req.body, true);

    const data = await updateAddress(req.user!.userId, id, input);

    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function makeDefaultAddress(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = getAddressId(req);

    const data = await setDefaultAddress(req.user!.userId, id);

    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function removeAddress(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = getAddressId(req);

    const data = await deleteAddress(req.user!.userId, id);

    res.json({ success: true, ...data });
  } catch (error) {
    handleError(error, res, next);
  }
}
