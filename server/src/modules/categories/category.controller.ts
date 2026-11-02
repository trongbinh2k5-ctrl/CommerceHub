import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import {
  createCategory,
  getActiveCategories,
  getAllCategories,
  updateCategory,
  deactivateCategory,
  restoreCategory,
} from "./category.service";

export const addCategory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const body = req.body;

    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.slug !== "string" ||
      (body.description !== undefined && typeof body.description !== "string")
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid category data",
      });
      return;
    }

    const name = body.name.trim();
    const slug = body.slug.trim().toLowerCase();
    const description = body.description?.trim();

    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      res.status(400).json({
        success: false,
        message: "Invalid category name or slug",
      });
      return;
    }

    const category = await createCategory({
      name,
      slug,
      description,
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "Category slug already exists",
      });
      return;
    }

    console.error("Create category error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getCategories = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const categories = await getActiveCategories();

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error: unknown) {
    console.error("Get categories error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAdminCategories = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const categories = await getAllCategories();

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error: unknown) {
    console.error("Get admin categories error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const editCategory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
      return;
    }

    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({
        success: false,
        message: "Invalid category data",
      });
      return;
    }

    const allowedFields = ["name", "slug", "description"];

    const keys = Object.keys(body);

    if (keys.length === 0 || keys.some((key) => !allowedFields.includes(key))) {
      res.status(400).json({
        success: false,
        message: "Invalid category fields",
      });
      return;
    }

    const data: {
      name?: string;
      slug?: string;
      description?: string;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        res.status(400).json({
          success: false,
          message: "Invalid category name",
        });
        return;
      }

      data.name = body.name.trim();
    }

    if (body.slug !== undefined) {
      if (typeof body.slug !== "string") {
        res.status(400).json({
          success: false,
          message: "Invalid category slug",
        });
        return;
      }

      const slug = body.slug.trim().toLowerCase();

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        res.status(400).json({
          success: false,
          message: "Invalid category slug",
        });
        return;
      }

      data.slug = slug;
    }

    if (body.description !== undefined) {
      if (typeof body.description !== "string") {
        res.status(400).json({
          success: false,
          message: "Invalid category description",
        });
        return;
      }

      data.description = body.description.trim();
    }

    const category = await updateCategory(id, data);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "Category slug already exists",
      });
      return;
    }

    console.error("Update category error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const hideCategory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
      return;
    }

    const category = await deactivateCategory(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Category deactivated successfully",
      data: category,
    });
  } catch (error: unknown) {
    console.error("Deactivate category error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const reactivateCategory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
      return;
    }

    const category = await restoreCategory(id);

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Category restored successfully",
      data: category,
    });
  } catch (error: unknown) {
    console.error("Restore category error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
