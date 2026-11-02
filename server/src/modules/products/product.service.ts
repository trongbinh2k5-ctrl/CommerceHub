import { Product } from "./product.model";
import { Category } from "../categories/category.model";
type ProductQuery = {
  search?: string;
  page: number;
  limit: number;
  minPrice?: number;
  maxPrice?: number;
  categoryId?: string;
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
}: AdminProductQuery) => {
  const filter: {
    isActive?: boolean;
    categoryId?: string | { $in: string[] };
    $or?: Array<{ categoryId: null } | { categoryId: { $in: string[] } }>;
    name?: { $regex: string; $options: string };
    price?: { $gte?: number; $lte?: number };
  } = {};

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

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

  const sortOption: { price?: 1 | -1; _id: -1 } = {
    _id: -1,
  };

  if (sort === "price_asc") {
    sortOption.price = 1;
  } else if (sort === "price_desc") {
    sortOption.price = -1;
  }

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

export const createProduct = async (data: {
  name: string;
  sku: string;
  price: number;
  description?: string;
  categoryId?: string;
  stock?: number;
}) => {
  if (data.categoryId !== undefined) {
    const category = await Category.findOne({
      _id: data.categoryId,
      isActive: true,
    });

    if (!category) {
      return null;
    }
  }

  const product = await Product.create(data);

  return product;
};

export const updateProduct = async (
  id: string,
  data: {
    name?: string;
    sku?: string;
    price?: number;
    description?: string;
    categoryId?: string;
  },
) => {
  if (data.categoryId !== undefined) {
    const category = await Category.findOne({
      _id: data.categoryId,
      isActive: true,
    });

    if (!category) {
      return { status: "CATEGORY_NOT_FOUND" as const };
    }
  }

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: data },
    {
      new: true,
      runValidators: true,
    },
  );

  return {
    status: "SUCCESS" as const,
    product,
  };
};

export const softDeleteProduct = async (id: string) => {
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
    },
  );

  return product;
};

export const restoreProduct = async (id: string) => {
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
    },
  );

  return product;
};

export const getProductById = async (id: string) => {
  const product = await Product.findOne({
    _id: id,
    isActive: true,
  }).populate<{
    categoryId: {
      _id: string;
      name: string;
      slug: string;
      isActive: boolean;
    } | null;
  }>("categoryId", "name slug isActive");

  if (!product) {
    return null;
  }

  // Nếu sản phẩm thuộc danh mục đã bị ẩn thì không hiển thị công khai
  if (product.categoryId && !product.categoryId.isActive) {
    return null;
  }

  return product;
};
export const adjustProductStock = async (id: string, delta: number) => {
  const filter =
    delta < 0
      ? {
          _id: id,
          stock: { $gte: -delta },
        }
      : {
          _id: id,
          stock: {
            $lte: Number.MAX_SAFE_INTEGER - delta,
          },
        };

  const product = await Product.findOneAndUpdate(
    filter,
    {
      $inc: {
        stock: delta,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return product;
};
