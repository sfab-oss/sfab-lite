import { Hono } from "hono";
import { handleHealth } from "@/lib/protected/health.js";
import { protectedCtx } from "../context.js";
import type { AdminEnv } from "../types.js";

const healthRoutes = new Hono<AdminEnv>().get("/health", async (c) => {
  const r = await handleHealth(protectedCtx(c));
  return c.json(r.body, r.status);
});

export default healthRoutes;
