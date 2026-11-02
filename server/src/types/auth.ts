export type UserRole = "CUSTOMER" | "STAFF" | "ADMIN";

export type AuthUser = {
  userId: string;
  role: UserRole;
};
