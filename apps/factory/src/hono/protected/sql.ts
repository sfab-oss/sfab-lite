import { Hono } from "hono";
import { handleSql } from "../../lib/protected/sql.js";
import { appCtx } from "../context.js";
import { requireApp } from "../middleware.js";
import { sqlBodySchema } from "../schemas.js";
import type { AdminEnv } from "../types.js";
import { jsonBody } from "../validate.js";

const sqlRoutes = new Hono<AdminEnv>().post(
  "/:appId/sql",
  requireApp,
  jsonBody(sqlBodySchema),
  async (c) => {
    const r = await handleSql(appCtx(c), c.req.valid("json"));
    return c.json(r.body, r.status);
  }
);

export default sqlRoutes;
