import { Hono } from "hono";
import type { AppEnv } from "../types";

export const publicRoutes = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ ok: true, service: "sfab-lite-app" }))
  .all("/auth/*", (c) => c.get("auth").handler(c.req.raw));
