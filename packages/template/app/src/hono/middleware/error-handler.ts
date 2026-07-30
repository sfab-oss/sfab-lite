import type { ErrorHandler } from "hono";
import type { AppEnv } from "../types";

export const appErrorHandler: ErrorHandler<AppEnv> = (err, c) => {
  console.error(err);
  return c.json({ error: "internal" as const }, 500);
};
