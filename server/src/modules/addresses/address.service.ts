import mongoose, { ClientSession } from "mongoose";
import { Address } from "./address.model";
import { User } from "../auth/user.model";

export class AddressError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AddressError";
  }
}

export type AddressInput = {
  fullName: string;
  phone: string;
  province: string;
  ward: string;
  detail: string;
  label?: string;
};

export type AddressUpdate = Partial<AddressInput>;

const MAX_ADDRESSES = 10;

const isConflict = (error: unknown) => {
  if (!(error instanceof Error)) return false;

  const mongoError = error as Error & {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
  };

  return (
    mongoError.code === 11000 ||
    mongoError.code === 112 ||
    mongoError.hasErrorLabel?.("TransientTransactionError") === true
  );
};

// Serialize address writes for the same user.
async function lockUser(userId: string, session: ClientSession) {
  const user = await User.findOneAndUpdate(
    { _id: userId, isActive: true },
    { $inc: { __v: 1 } },
    { session, new: true },
  );

  if (!user) {
    throw new AddressError(401, "Account is unavailable");
  }
}

async function executeWrite<T>(
  userId: string,
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = await mongoose.startSession();

    try {
      let result: T | undefined;
      let completed = false;

      await session.withTransaction(async () => {
        await lockUser(userId, session);
        result = await operation(session);
        completed = true;
      });

      if (!completed) {
        throw new Error("Address transaction did not complete");
      }

      return result as T;
    } catch (error) {
      if (isConflict(error)) {
        if (attempt < 2) continue;

        throw new AddressError(409, "Concurrent address update. Please retry.");
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  throw new AddressError(409, "Address update conflict");
}

export async function listAddresses(userId: string) {
  return Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
}

export async function createAddress(userId: string, input: AddressInput) {
  return executeWrite(userId, async (session) => {
    const count = await Address.countDocuments({
      userId,
    }).session(session);

    if (count >= MAX_ADDRESSES) {
      throw new AddressError(400, "Maximum 10 addresses allowed");
    }

    const [address] = await Address.create(
      [
        {
          ...input,
          userId,
          isDefault: count === 0,
        },
      ],
      { session },
    );

    return address;
  });
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressUpdate,
) {
  return executeWrite(userId, async (session) => {
    const address = await Address.findOneAndUpdate(
      { _id: addressId, userId },
      { $set: input },
      {
        new: true,
        runValidators: true,
        session,
      },
    );

    if (!address) {
      throw new AddressError(404, "Address not found");
    }

    return address;
  });
}

export async function setDefaultAddress(userId: string, addressId: string) {
  return executeWrite(userId, async (session) => {
    const address = await Address.findOne({
      _id: addressId,
      userId,
    }).session(session);

    if (!address) {
      throw new AddressError(404, "Address not found");
    }

    if (address.isDefault) return address;

    await Address.updateMany(
      { userId, isDefault: true },
      { $set: { isDefault: false } },
      { session },
    );

    address.isDefault = true;
    await address.save({ session });

    return address;
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  return executeWrite(userId, async (session) => {
    const address = await Address.findOne({
      _id: addressId,
      userId,
    }).session(session);

    if (!address) {
      throw new AddressError(404, "Address not found");
    }

    await Address.deleteOne({ _id: addressId, userId }, { session });

    if (address.isDefault) {
      const replacement = await Address.findOne({
        userId,
      })
        .sort({ createdAt: -1, _id: -1 })
        .session(session);

      if (replacement) {
        replacement.isDefault = true;
        await replacement.save({ session });
      }
    }

    return { message: "Address deleted successfully" };
  });
}
