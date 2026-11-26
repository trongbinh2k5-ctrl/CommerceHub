import mongoose from "mongoose";
import { parseProductQuery } from "./product-query.parser";
import { isValidProductImage } from "./product-image";
import { parseProductDetails } from './product-details';
import type { ProductDetails } from './product-details';
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
    let details;
    try { details = parseProductDetails(req.body ?? {}); } catch (e) { res.status(400).json({ success: false, message: (e as Error).message }); return; }
    const { name, sku, price, description, categoryId, imageUrl, stock } = req.body ?? {};
    if (imageUrl !== undefined && !isValidProductImage(imageUrl)) {
      res.status(400).json({ success: false, message: "Invalid product image URL" });
      return;
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof sku !== "string" ||
      !sku.trim() ||
      typeof price !== "number" ||
      !Number.isSafeInteger(price) ||
      price < 0 ||
      (description !== undefined && typeof description !== "string") ||
      (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0))
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
      ...details,
      name: name.trim(),
      sku: sku.trim(),
      price,
      description: typeof description === "string" ? description : "",
      categoryId,
      imageUrl,
      stock,
    }, req.user?.userId);

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
    let details;
    try { details = parseProductDetails(req.body ?? {}); } catch (e) { res.status(400).json({ success: false, message: (e as Error).message }); return; }
    const { id } = req.params;

    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
      return;
    }

    const { name, sku, price, description, categoryId, imageUrl } = req.body ?? {};
    const data: ProductDetails & {
      name?: string;
      sku?: string;
      price?: number;
      description?: string;
      categoryId?: string | null;
      imageUrl?: string;
    } = { ...details };

    if (imageUrl !== undefined) {
      if (!isValidProductImage(imageUrl)) {
        res.status(400).json({ success: false, message: "Invalid product image URL" });
        return;
      }
      data.imageUrl = imageUrl;
    }

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
        categoryId !== null &&
        (typeof categoryId !== "string" || !mongoose.isValidObjectId(categoryId))
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

    const result = await updateProduct(id, data, req.user?.userId);

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

    const product = await softDeleteProduct(id, req.user?.userId);

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

    const product = await restoreProduct(id, req.user?.userId);

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

    const reason=req.body?.reason;
    if(reason!==undefined && (typeof reason!=='string'||!reason.trim()||reason.length>500)){res.status(400).json({message:'Lý do điều chỉnh không hợp lệ.'});return;}
    const product = await adjustProductStock(id, delta, req.user?.userId, typeof reason==='string'?reason.trim():undefined);

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
