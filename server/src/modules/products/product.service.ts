import { Product } from "./product.model";
import { Category } from "../categories/category.model";
import mongoose from 'mongoose';
import { StockMovement } from '../operations/operations.models';
import type { ProductDetails } from './product-details';
import { auditChanges, recordAudit } from '../operations/audit.service';
const productAuditFields=['name','sku','price','stock','isActive','categoryId','brand','modelName','condition','origin','variantGroup','variantLabel'] as const;
type ProductQuery = {
  search?: string;
  page: number;
  limit: number;
  minPrice?: number;
  maxPrice?: number;
  categoryId?: string;
  brand?: string;
  inStock?: boolean;
  sort?: "price_asc" | "price_desc";
};

type AdminProductQuery = ProductQuery & {
  isActive?: boolean;
  activeCategoryIds?: string[];
};

const queryProducts = async ({
  search,
  page,
  limit,
  minPrice,
  maxPrice,
  sort,
  isActive,
  categoryId,
  activeCategoryIds,
  brand,
  inStock,
}: AdminProductQuery) => {
  const filter: {
    isActive?: boolean;
    categoryId?: string | { $in: string[] };
    $or?: Array<{ categoryId: null } | { categoryId: { $in: string[] } }>;
    name?: { $regex: string; $options: string };
    price?: { $gte?: number; $lte?: number };
    brand?: string;
    stock?: { $gt: number } | number;
  } = {};

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }
  if (brand) filter.brand = brand;
  if (inStock !== undefined) filter.stock = inStock ? { $gt: 0 } : 0;

  if (activeCategoryIds !== undefined) {
    if (categoryId !== undefined) {
      filter.categoryId = {
        $in: activeCategoryIds.includes(categoryId) ? [categoryId] : [],
      };
    } else {
      filter.$or = [
        { categoryId: null },
        { categoryId: { $in: activeCategoryIds } },
      ];
    }
  } else if (categoryId !== undefined) {
    filter.categoryId = categoryId;
  }

  if (search) {
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.name = {
      $regex: safeSearch,
      $options: "i",
    };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};

    if (minPrice !== undefined) {
      filter.price.$gte = minPrice;
    }

    if (maxPrice !== undefined) {
      filter.price.$lte = maxPrice;
    }
  }

  // MongoDB uses field order as sort precedence; _id is only a tie-breaker.
  const sortOption: Record<string, 1 | -1> = sort === "price_asc"
    ? { price: 1, _id: -1 }
    : sort === "price_desc"
      ? { price: -1, _id: -1 }
      : { createdAt: -1, _id: -1 };

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("categoryId", "name slug isActive")
      .sort(sortOption)
      .skip(skip)
      .limit(limit),

    Product.countDocuments(filter),
  ]);

  return {
    products,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const getAllProducts = async (query: ProductQuery) => {
  const activeCategories = await Category.find({
    isActive: true,
  }).select("_id");

  const activeCategoryIds = activeCategories.map((category) =>
    category._id.toString(),
  );

  return queryProducts({
    ...query,
    isActive: true,
    activeCategoryIds,
  });
};

export const getAdminProducts = async (query: AdminProductQuery) => {
  return queryProducts(query);
};

export const createProduct = async (data: ProductDetails & {
  name: string;
  sku: string;
  price: number;
  description?: string;
  categoryId?: string;
  stock?: number;
  imageUrl?: string;
}, actorId?:string) => {
  if (data.categoryId !== undefined) {
    const category = await Category.findOne({
      _id: data.categoryId,
      isActive: true,
    });

    if (!category) {
      return null;
    }
  }

  const session=await mongoose.startSession();
  try { return await session.withTransaction(async()=>{
    const [product]=await Product.create([data],{session});
    await recordAudit(actorId,'PRODUCT_CREATED','PRODUCT',product!._id,'Tạo sản phẩm.',auditChanges(null,product,productAuditFields),session);
    return product!;
  }); } finally { await session.endSession(); }
};

export const updateProduct = async (
  id: string,
  data: ProductDetails & {
    name?: string;
    sku?: string;
    price?: number;
    description?: string;
    categoryId?: string | null;
    imageUrl?: string;
  },
  actorId?:string,
) => {
  if (data.categoryId !== undefined && data.categoryId !== null) {
    const category = await Category.findOne({
      _id: data.categoryId,
      isActive: true,
    });

    if (!category) {
      return { status: "CATEGORY_NOT_FOUND" as const };
    }
  }

  const session=await mongoose.startSession();
  try { return await session.withTransaction(async()=>{
  const before=await Product.findById(id).session(session);
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: data },
    {
      new: true,
      runValidators: true,
      session,
    },
  );

  if(product)await recordAudit(actorId,'PRODUCT_UPDATED','PRODUCT',product._id,'Cập nhật sản phẩm.',auditChanges(before,product,productAuditFields),session);
  return {
    status: "SUCCESS" as const,
    product,
  };
  }); } finally { await session.endSession(); }
};

export const softDeleteProduct = async (id: string, actorId?:string) => {
  const session=await mongoose.startSession();
  try { return await session.withTransaction(async()=>{
  const product = await Product.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      $set: { isActive: false },
    },
    {
      new: true,
      session,
    },
  );

  if(product)await recordAudit(actorId,'PRODUCT_UPDATED','PRODUCT',product._id,'Ẩn sản phẩm.',[{field:'isActive',before:true,after:false}],session);
  return product;
  }); } finally { await session.endSession(); }
};

export const restoreProduct = async (id: string, actorId?:string) => {
  const session=await mongoose.startSession();
  try { return await session.withTransaction(async()=>{
  const product = await Product.findOneAndUpdate(
    {
      _id: id,
      isActive: false,
    },
    {
      $set: { isActive: true },
    },
    {
      new: true,
      runValidators: true,
      session,
    },
  );

  if(product)await recordAudit(actorId,'PRODUCT_UPDATED','PRODUCT',product._id,'Khôi phục sản phẩm.',[{field:'isActive',before:false,after:true}],session);
  return product;
  }); } finally { await session.endSession(); }
};

export const getProductById = async (id: string) => {
  const product = await Product.findOne({
    _id: id,
    isActive: true,
  });

  if (!product) {
    return null;
  }

  // A missing or hidden category must have the same visibility as in the listing.
  if (product.categoryId && !await Category.exists({ _id: product.categoryId, isActive: true })) {
    return null;
  }

  return product.populate("categoryId", "name slug isActive");
};
export const adjustProductStock = async (id: string, delta: number, actorId?: string, reason = 'Chưa ghi lý do') => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const filter = delta < 0 ? {_id:id,stock:{$gte:-delta}} : {_id:id,stock:{$lte:Number.MAX_SAFE_INTEGER-delta}};
      const product = await Product.findOneAndUpdate(filter,{$inc:{stock:delta}},{returnDocument:'after',runValidators:true,session});
      if(!product) return null;
      await StockMovement.create([{productId:product._id,actorId,delta,before:product.stock-delta,after:product.stock,reason}],{session});
      await recordAudit(actorId,'STOCK_ADJUSTED','PRODUCT',product._id,reason,[{field:'stock',before:product.stock-delta,after:product.stock}],session);
      return product;
    });
  } finally { await session.endSession(); }
};
