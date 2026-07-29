import { Hono } from "hono";
import {
  handleCheck,
  handleCommit,
  handleRevert,
} from "../../lib/protected/lifecycle.js";
import { appCtx } from "../context.js";
import { requireApp } from "../middleware.js";
import {
  checkBodySchema,
  commitBodySchema,
  revertBodySchema,
} from "../schemas.js";
import type { AdminEnv } from "../types.js";
import { jsonBody } from "../validate.js";

const lifecycleRoutes = new Hono<AdminEnv>()
  .post("/:appId/check", requireApp, jsonBody(checkBodySchema), async (c) => {
    const r = await handleCheck(appCtx(c), c.req.valid("json"));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .post("/:appId/commit", requireApp, jsonBody(commitBodySchema), async (c) => {
    const r = await handleCommit(appCtx(c), c.req.valid("json"));
    if (r.status === 202) {
      return c.json(r.body, 202);
    }
    return c.json(r.body, r.status);
  })
  .post("/:appId/revert", requireApp, jsonBody(revertBodySchema), async (c) => {
    const r = await handleRevert(appCtx(c), c.req.valid("json"));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  });

export default lifecycleRoutes;
