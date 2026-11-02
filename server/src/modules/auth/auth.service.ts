import bcrypt from "bcryptjs";
import { User } from "./user.model";

type RegisterData = {
  fullName: string;
  email: string;
  password: string;
};

export const registerUser = async (data: RegisterData) => {
  const email = data.email.trim().toLowerCase();

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await User.create({
    fullName: data.fullName.trim(),
    email,
    passwordHash,
    role: "CUSTOMER",
  });

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
};

type LoginData = {
  email: string;
  password: string;
};

export const loginUser = async (data: LoginData) => {
  const email = data.email.trim().toLowerCase();

  const user = await User.findOne({
    email,
    isActive: true,
  }).select("+passwordHash");

  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const isPasswordValid = await bcrypt.compare(
    data.password,
    user.passwordHash,
  );

  if (!isPasswordValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
};
