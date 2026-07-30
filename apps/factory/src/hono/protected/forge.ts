import { Hono } from "hono";
import {
  handleCreatePr,
  handleGetPr,
  handleGetRun,
  handleGetTree,
  handleGetTreeFile,
  handleListPrChecks,
  handleListPrs,
  handleListRuns,
  handleMergePr,
  handlePrDiff,
  handleRerun,
} from "@/lib/protected/forge.js";
import { appCtx } from "../context.js";
import { requireApp } from "../middleware.js";
import {
  createPrBodySchema,
  listRunsQuerySchema,
  treeFileQuerySchema,
  treeQuerySchema,
} from "../schemas.js";
import type { AdminEnv } from "../types.js";
import { jsonBody, queryParams } from "../validate.js";

function parsePrNumber(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    return null;
  }
  return n;
}

const forgeRoutes = new Hono<AdminEnv>()
  .get("/:appId/prs", requireApp, async (c) => {
    const r = await handleListPrs(appCtx(c));
    return c.json(r.body, r.status);
  })
  .post("/:appId/prs", requireApp, jsonBody(createPrBodySchema), async (c) => {
    const r = await handleCreatePr(appCtx(c), c.req.valid("json"));
    if (r.status === 201) {
      return c.json(r.body, 201);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/prs/:number", requireApp, async (c) => {
    const number = parsePrNumber(c.req.param("number") ?? "");
    if (number == null) {
      return c.json({ ok: false as const, error: "invalid_pr_number" }, 400);
    }
    const r = await handleGetPr(appCtx(c), number);
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .post("/:appId/prs/:number/merge", requireApp, async (c) => {
    const number = parsePrNumber(c.req.param("number") ?? "");
    if (number == null) {
      return c.json({ ok: false as const, error: "invalid_pr_number" }, 400);
    }
    const r = await handleMergePr(appCtx(c), number);
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/prs/:number/checks", requireApp, async (c) => {
    const number = parsePrNumber(c.req.param("number") ?? "");
    if (number == null) {
      return c.json({ ok: false as const, error: "invalid_pr_number" }, 400);
    }
    const r = await handleListPrChecks(appCtx(c), number);
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/prs/:number/diff", requireApp, async (c) => {
    const number = parsePrNumber(c.req.param("number") ?? "");
    if (number == null) {
      return c.json({ ok: false as const, error: "invalid_pr_number" }, 400);
    }
    const r = await handlePrDiff(appCtx(c), number);
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/tree", requireApp, queryParams(treeQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const r = await handleGetTree(appCtx(c), q.ref ?? "main");
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get(
    "/:appId/tree/file",
    requireApp,
    queryParams(treeFileQuerySchema),
    async (c) => {
      const q = c.req.valid("query");
      const r = await handleGetTreeFile(appCtx(c), q.ref ?? "main", q.path);
      if (r.status === 200) {
        return c.json(r.body, 200);
      }
      return c.json(r.body, r.status);
    }
  )
  .get(
    "/:appId/runs",
    requireApp,
    queryParams(listRunsQuerySchema),
    async (c) => {
      const q = c.req.valid("query");
      const r = await handleListRuns(appCtx(c), {
        sha: q.sha,
        limit: q.limit,
      });
      return c.json(r.body, r.status);
    }
  )
  .get("/:appId/runs/:runId", requireApp, async (c) => {
    const runId = decodeURIComponent(c.req.param("runId") ?? "");
    const r = await handleGetRun(appCtx(c), runId);
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .post("/:appId/runs/:runId/rerun", requireApp, async (c) => {
    const runId = decodeURIComponent(c.req.param("runId") ?? "");
    const r = await handleRerun(appCtx(c), runId);
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  });

export default forgeRoutes;
