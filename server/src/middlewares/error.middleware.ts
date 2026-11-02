import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (res.headersSent) {
    _next(error);
    return;
  }

  const parserError = error as { type?: string } | null;
  if (parserError?.type === "entity.parse.failed" || parserError?.type === "entity.too.large") {
    const tooLarge = parserError.type === "entity.too.large";
    res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? "Request body is too large" : "Invalid JSON body",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    const err = error as { statusCode: number; message: string };
    const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      message: status >= 500 ? "Internal server error" : err.message,
    });
    return;
  }

  console.error("server error", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
