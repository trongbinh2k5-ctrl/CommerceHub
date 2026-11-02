import { Order, OrderStatus } from "../orders/order.model";
import { Payment, PaymentStatus } from "../payments/payment.model";
import { Product } from "../products/product.model";
import { User } from "../auth/user.model";

export class DashboardError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DashboardError";
  }
}

export type RevenuePeriod = "day" | "month";

export interface RevenueFilter {
  from: Date;
  toExclusive: Date;
  period: RevenuePeriod;
}

export const getDashboardOverview = async () => {
  const [
    totalOrders,
    totalCustomers,
    totalProducts,
    paidPayments,
    revenueResult,
  ] = await Promise.all([
    Order.countDocuments(),
    User.countDocuments({ role: "CUSTOMER" }),
    Product.countDocuments(),
    Payment.countDocuments({
      status: PaymentStatus.PAID,
    }),
    Payment.aggregate<{ total: number }>([
      {
        $match: {
          status: PaymentStatus.PAID,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  return {
    totalOrders,
    totalCustomers,
    totalProducts,
    paidPayments,
    totalRevenue: revenueResult[0]?.total ?? 0,
    currency: "VND",
  };
};

export const getDashboardRevenue = async (filter: RevenueFilter) => {
  const format = filter.period === "month" ? "%Y-%m" : "%Y-%m-%d";

  const result = await Payment.aggregate<{
    period: string;
    revenue: number;
    paymentCount: number;
  }>([
    {
      $match: {
        status: PaymentStatus.PAID,
        paidAt: {
          $gte: filter.from,
          $lt: filter.toExclusive,
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format,
            date: "$paidAt",
            timezone: "UTC",
          },
        },
        revenue: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        revenue: 1,
        paymentCount: 1,
      },
    },
    {
      $sort: { period: 1 },
    },
  ]);

  return {
    from: filter.from.toISOString(),
    toExclusive: filter.toExclusive.toISOString(),
    period: filter.period,
    currency: "VND",
    data: result,
  };
};

export const getDashboardOrderStats = async () => {
  const result = await Order.aggregate<{
    _id: OrderStatus;
    count: number;
  }>([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const counts = Object.fromEntries(
    Object.values(OrderStatus).map((status) => [status, 0]),
  ) as Record<OrderStatus, number>;

  for (const item of result) {
    if (item._id in counts) {
      counts[item._id] = item.count;
    }
  }

  return {
    totalOrders: Object.values(counts).reduce((sum, count) => sum + count, 0),
    byStatus: counts,
  };
};

export const getDashboardTopProducts = async (limit: number) => {
  return Payment.aggregate<{
    productId: string;
    name: string;
    sku: string;
    totalQuantity: number;
    grossSales: number;
    orderCount: number;
  }>([
    {
      $match: {
        status: PaymentStatus.PAID,
      },
    },
    {
      $lookup: {
        from: Order.collection.name,
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    { $unwind: "$order.items" },
    {
      $group: {
        _id: "$order.items.productId",
        name: { $last: "$order.items.name" },
        sku: { $last: "$order.items.sku" },
        totalQuantity: {
          $sum: "$order.items.quantity",
        },
        grossSales: {
          $sum: "$order.items.subtotal",
        },
        orderCount: { $sum: 1 },
      },
    },
    {
      $sort: {
        totalQuantity: -1,
        grossSales: -1,
        _id: 1,
      },
    },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        productId: { $toString: "$_id" },
        name: 1,
        sku: 1,
        totalQuantity: 1,
        grossSales: 1,
        orderCount: 1,
      },
    },
  ]);
};

export const getDashboardLowStock = async (
  threshold: number,
  limit: number,
) => {
  const products = await Product.find({
    isActive: true,
    stock: { $lte: threshold },
  })
    .select("name sku price stock")
    .sort({ stock: 1, _id: 1 })
    .limit(limit)
    .lean();

  return {
    threshold,
    count: products.length,
    products,
  };
};
