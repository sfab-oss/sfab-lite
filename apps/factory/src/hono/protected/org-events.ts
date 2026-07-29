import { Hono } from "hono";
import { factoryTrustedOrigins } from "../../auth.js";
import { consentOriginAllowed } from "../../mcp/lib/consent-origin.js";
import type { AdminEnv } from "../types.js";

/**
 * Same-origin WebSocket upgrade for the org hint bus.
 *
 * Session-only: `ADMIN_TOKEN` must not open browser sockets (server publish
 * only). Origin checked against the factory trusted set. Session org must
 * match the DO address.
 */
const orgEventsRoutes = new Hono<AdminEnv>().get("/ws", (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.text("Expected WebSocket", 426);
  }

  const actor = c.get("actor");
  if (actor.kind !== "session") {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  if (
    !consentOriginAllowed(
      c.req.raw,
      factoryTrustedOrigins(c.env, new URL(c.req.url).origin)
    )
  ) {
    return c.json({ ok: false, error: "origin_forbidden" }, 403);
  }

  const organizationId = actor.organizationId;
  const stub = c.env.ORG_EVENTS.get(
    c.env.ORG_EVENTS.idFromName(organizationId)
  );
  return stub.fetch(c.req.raw);
});

export default orgEventsRoutes;
