import { Hono } from "hono";
import {
  handleGetAttempt,
  handleGetLive,
  handleListAttempts,
} from "../../lib/protected/live.js";
import { appCtx } from "../context.js";
import { requireApp } from "../middleware.js";
import type { AdminEnv } from "../types.js";

const liveRoutes = new Hono<AdminEnv>()
  .get("/:appId/live", requireApp, async (c) => {
    const r = await handleGetLive(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/attempts/:attemptId", requireApp, async (c) => {
    c.set("attemptId", decodeURIComponent(c.req.param("attemptId") ?? ""));
    const r = await handleGetAttempt(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/attempts", requireApp, async (c) => {
    const r = await handleListAttempts(appCtx(c));
    return c.json(r.body, r.status);
  });

export default liveRoutes;
