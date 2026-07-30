import { Hono } from "hono";
import { requireOrg } from "../middleware/auth";
import type { AppEnv } from "../types";
import { documentRoutes } from "./documents";
import { entityRoutes } from "./entities";
import { productRoutes } from "./products";

export const orgProtectedRoutes = new Hono<AppEnv>()
  .use("*", requireOrg)
  .route("/entities", entityRoutes)
  .route("/products", productRoutes)
  .route("/documents", documentRoutes);
