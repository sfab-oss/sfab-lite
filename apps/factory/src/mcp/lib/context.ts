import { getAgentByName } from "agents";

/** Where the loopback lands. Never leaves the Worker. */
const LOOPBACK_ORIGIN = "https://sfab-lite.internal";

export interface McpContext {
  env: Env;
  /** Scopes every `organization`-scoped protected route. */
  organizationId: string;
}

/**
 * Call the factory's own `/api/protected/*` API.
 *
 * The protected handlers own tenancy, validation and the create/commit
 * choreography already; reaching them over the loopback rather than
 * re-implementing them is what stops the MCP surface from drifting into a
 * second, subtly different factory API. Same pattern as `internal.ts`, minus
 * the derived token — this caller has `ADMIN_TOKEN` itself.
 */
export async function protectedFetch(
  ctx: McpContext,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const token = ctx.env.ADMIN_TOKEN;
  if (!token) {
    throw new Error("ADMIN_TOKEN is not configured on this factory");
  }
  const res = await ctx.env.SELF.fetch(
    new Request(`${LOOPBACK_ORIGIN}${path}`, {
      method,
      headers: {
        "X-Admin-Token": token,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** `?organizationId=` is how token actors scope an org-scoped protected route. */
export function orgQuery(ctx: McpContext): string {
  return `?organizationId=${encodeURIComponent(ctx.organizationId)}`;
}

/**
 * An AppAgent stub whose `onStart` has already run.
 *
 * `getAgentByName` rather than `idFromName`: a native RPC call does not pass
 * through `Server.fetch()`, which is where partyserver would otherwise
 * initialize the object. Reaching an uninitialized AppAgent gets an unseeded
 * workspace and an unresolved `this.name` — so `readDir("/")` answers `[]` for
 * an app whose files are perfectly intact, and `runShell` builds its commands
 * for an undefined appId. The console never hit this because a websocket
 * connect goes through fetch.
 */
export function appAgent(env: Env, appId: string) {
  return getAgentByName(env.AppAgent, appId);
}
