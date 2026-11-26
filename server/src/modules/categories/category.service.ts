import { Category } from "./category.model";
import { isValidObjectId } from "mongoose";
import { availableCategorySlug } from './category-slug';
type CreateCategoryInput = {
  name: string;
  slug?: string;
  description?: string;
};

export const createCategory = async (data: CreateCategoryInput) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await Category.create({ ...data, slug: data.slug || await availableCategorySlug(data.name) }); }
    catch (e: any) { if (data.slug || e?.code !== 11000 || attempt === 3) throw e; }
  }
  throw new Error('Không thể tạo đường dẫn danh mục.');
};

export const getActiveCategories = async () => {
  return Category.find({ isActive: true }).sort({ name: 1 }).lean();
};

export const getAllCategories = async () => {
  return Category.find().sort({ name: 1 }).lean();
};
export type UpdateCategoryInput = {
  name?: string;
  slug?: string;
  description?: string;
};

export const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  return Category.findByIdAndUpdate(
    id,
    { $set: data },
    {
      new: true,
      runValidators: true,
    },
  );
};

export const deactivateCategory = async (id: string) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  return Category.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true, runValidators: true },
  );
};

export const restoreCategory = async (id: string) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  return Category.findByIdAndUpdate(
    id,
    { $set: { isActive: true } },
    { new: true, runValidators: true },
  );
};
