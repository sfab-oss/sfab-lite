import { Hono } from "hono";
import { requireOrg } from "../middleware/auth";
import type { AppEnv } from "../types";
import { balanceRoutes } from "./balances";
import { partyRoutes } from "./parties";

export const orgProtectedRoutes = new Hono<AppEnv>()
  .use("*", requireOrg)
  .route("/parties", partyRoutes)
  .route("/balances", balanceRoutes);
