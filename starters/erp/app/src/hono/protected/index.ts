import { Hono } from "hono";
import { orgProtectedRoutes } from "../org-protected";
import type { AppEnv } from "../types";
import { sessionContextRoutes } from "./session-context";

/**
 * Authenticated surface. Session bootstrap is org-optional; entity/product/
 * document routes carry `requireOrg` via `orgProtectedRoutes`.
 */
export const protectedRoutes = new Hono<AppEnv>()
  .route("/session-context", sessionContextRoutes)
  .route("/", orgProtectedRoutes);
