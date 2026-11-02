import mongoose from "mongoose";
import { parseProductQuery } from "./product-query.parser";
import { Request, Response, NextFunction } from "express";
import {
  getAllProducts,
  createProduct,
  updateProduct,
  softDeleteProduct,
  restoreProduct,
  getProductById,
  getAdminProducts,
  adjustProductStock,
} from "./product.service";

export const getProducts = async (req: Request, res: Response) => {
  try {
    const parsed = parseProductQuery(req.query);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const result = await getAllProducts(parsed.data);

    res.json({
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get products failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get products",
    });
  }
};

export const addProduct = async (req: Request, res: Response) => {
  try {
    const { name, sku, price, description, categoryId } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof sku !== "string" ||
      !sku.trim() ||
      typeof price !== "number" ||
      !Number.isSafeInteger(price) ||
      price < 0
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid product data",
      });
      return;
    }
    if (
      categoryId !== undefined &&
      (typeof categoryId !== "string" || !mongoose.isValidObjectId(categoryId))
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
      return;
    }
    const product = await createProduct({
      name: name.trim(),
      sku: sku.trim(),
      price,
      description: typeof description === "string" ? description : "",
      categoryId,
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Active category not found",
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error: unknown) {
    console.error("Create product failed:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "Product SKU already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
};
export const editProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    const { name, sku, price, description, categoryId } = req.body ?? {};
    const data: {
      name?: string;
      sku?: string;
      price?: number;
      description?: string;
      categoryId?: string;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({
          success: false,
          message: "Invalid product name",
        });
        return;
      }
      data.name = name.trim();
    }

    if (sku !== undefined) {
      if (typeof sku !== "string" || !sku.trim()) {
        res.status(400).json({
          success: false,
          message: "Invalid SKU",
        });
        return;
      }
      data.sku = sku.trim();
    }

    if (price !== undefined) {
      if (
        typeof price !== "number" ||
        !Number.isSafeInteger(price) ||
        price < 0
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid price",
        });
        return;
      }
      data.price = price;
    }

    if (description !== undefined) {
      if (typeof description !== "string") {
        res.status(400).json({
          success: false,
          message: "Invalid description",
        });
        return;
      }
      data.description = description;
    }

    if (categoryId !== undefined) {
      if (
        typeof categoryId !== "string" ||
        !mongoose.isValidObjectId(categoryId)
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
        return;
      }

      data.categoryId = categoryId;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
      return;
    }

    const result = await updateProduct(id, data);

    if (result.status === "CATEGORY_NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Active category not found",
      });
      return;
    }

    if (!result.product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    res.json({
      success: true,
      data: result.product,
    });
  } catch (error: unknown) {
    console.error("Update product failed:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "Product SKU already exists",
      });
      return;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        success: false,
        message: "Invalid product data",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    const product = await softDeleteProduct(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Active product not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Product deactivated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Soft delete failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to deactivate product",
    });
  }
};

export const restoreDeletedProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    const product = await restoreProduct(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Deleted product not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Product restored successfully",
      data: product,
    });
  } catch (error) {
    console.error("Restore product failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to restore product",
    });
  }
};
export const getProductDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    const product = await getProductById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminProductList = async (req: Request, res: Response) => {
  try {
    const parsed = parseProductQuery(req.query, true);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const result = await getAdminProducts(parsed.data);

    res.json({
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error("Get admin products failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get admin products",
    });
  }
};
export const changeProductStock = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { delta } = req.body ?? {};

    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    if (
      typeof delta !== "number" ||
      !Number.isSafeInteger(delta) ||
      delta === 0
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid stock adjustment",
      });
      return;
    }

    const product = await adjustProductStock(id, delta);

    if (!product) {
      res.status(409).json({
        success: false,
        message: "Product not found or insufficient stock",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};
