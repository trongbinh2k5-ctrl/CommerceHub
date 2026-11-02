import { Request, Response, NextFunction } from "express";

import {
  DashboardError,
  getDashboardOverview,
  getDashboardRevenue,
  getDashboardOrderStats,
  getDashboardTopProducts,
  getDashboardLowStock,
  RevenuePeriod,
} from "./dashboard.service";

const getQueryString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const parseInteger = (
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new DashboardError(400, "Query parameter must be an integer");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new DashboardError(
      400,
      `Query parameter must be between ${min} and ${max}`,
    );
  }

  return parsed;
};

const parseDate = (value: unknown, name: string): Date => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DashboardError(400, `${name} must use YYYY-MM-DD`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new DashboardError(400, `Invalid ${name} date`);
  }

  return date;
};

const addUtcDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const parseRevenueFilter = (req: Request) => {
  const period = getQueryString(req.query.period) ?? "day";

  if (period !== "day" && period !== "month") {
    throw new DashboardError(400, "period must be day or month");
  }

  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const defaultFrom = addUtcDays(todayUtc, -29);

  const from =
    req.query.from === undefined
      ? defaultFrom
      : parseDate(req.query.from, "from");

  const to =
    req.query.to === undefined ? todayUtc : parseDate(req.query.to, "to");

  if (from.getTime() > to.getTime()) {
    throw new DashboardError(400, "from must not be after to");
  }

  const toExclusive = addUtcDays(to, 1);

  const days = (toExclusive.getTime() - from.getTime()) / 86400000;

  if (days > 366) {
    throw new DashboardError(400, "Date range must not exceed 366 days");
  }

  return {
    from,
    toExclusive,
    period: period as RevenuePeriod,
  };
};

export const dashboardOverviewController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getDashboardOverview();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const dashboardRevenueController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filter = parseRevenueFilter(req);
    const data = await getDashboardRevenue(filter);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const dashboardOrdersController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getDashboardOrderStats();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const dashboardTopProductsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const limit = parseInteger(req.query.limit, 10, 1, 100);

    const data = await getDashboardTopProducts(limit);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const dashboardLowStockController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const threshold = parseInteger(req.query.threshold, 5, 0, 1000000);

    const limit = parseInteger(req.query.limit, 20, 1, 100);

    const data = await getDashboardLowStock(threshold, limit);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
