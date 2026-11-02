import { Request } from "express";
import { isValidObjectId } from "mongoose";
type ProductSort = "price_asc" | "price_desc";

export type ProductListQuery = {
  search?: string;
  page: number;
  limit: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  categoryId?: string;
};

export type AdminProductListQuery = ProductListQuery & {
  isActive?: boolean;
};

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

export const parseProductQuery = (
  query: Request["query"],
  allowIsActive = false,
): ParseResult<ProductListQuery | AdminProductListQuery> => {
  const {
    search: rawSearch,
    page: rawPage,
    limit: rawLimit,
    minPrice: rawMinPrice,
    maxPrice: rawMaxPrice,
    sort: rawSort,
    categoryId: rawCategoryId,
    isActive: rawIsActive,
  } = query;

  const values = [
    rawSearch,
    rawPage,
    rawLimit,
    rawMinPrice,
    rawMaxPrice,
    rawSort,
    rawCategoryId,
    ...(allowIsActive ? [rawIsActive] : []),
  ];

  if (
    values.some((value) => value !== undefined && typeof value !== "string")
  ) {
    return {
      success: false,
      message: "Invalid query parameters",
    };
  }

  if (
    rawCategoryId !== undefined &&
    (typeof rawCategoryId !== "string" || !isValidObjectId(rawCategoryId))
  ) {
    return {
      success: false,
      message: "Invalid category ID",
    };
  }

  const categoryId =
    typeof rawCategoryId === "string" ? rawCategoryId : undefined;

  const search = typeof rawSearch === "string" ? rawSearch.trim() : undefined;

  if (search && search.length > 100) {
    return {
      success: false,
      message: "Search keyword is too long",
    };
  }

  const page = rawPage === undefined ? 1 : Number(rawPage);
  const limit = rawLimit === undefined ? 10 : Number(rawLimit);

  const minPrice = rawMinPrice === undefined ? undefined : Number(rawMinPrice);

  const maxPrice = rawMaxPrice === undefined ? undefined : Number(rawMaxPrice);

  const sort = typeof rawSort === "string" ? rawSort : undefined;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (minPrice !== undefined &&
      (!Number.isSafeInteger(minPrice) || minPrice < 0)) ||
    (maxPrice !== undefined &&
      (!Number.isSafeInteger(maxPrice) || maxPrice < 0)) ||
    (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) ||
    (sort !== undefined && sort !== "price_asc" && sort !== "price_desc")
  ) {
    return {
      success: false,
      message: "Invalid filter or pagination parameters",
    };
  }

  const data: AdminProductListQuery = {
    search,
    page,
    limit,
    minPrice,
    maxPrice,
    sort,
    categoryId,
  };

  if (allowIsActive) {
    if (
      rawIsActive !== undefined &&
      rawIsActive !== "true" &&
      rawIsActive !== "false"
    ) {
      return {
        success: false,
        message: "Invalid filter or pagination parameters",
      };
    }

    data.isActive =
      rawIsActive === undefined ? undefined : rawIsActive === "true";
  }

  return {
    success: true,
    data,
  };
};
