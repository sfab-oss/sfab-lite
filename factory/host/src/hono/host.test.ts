import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createHostApp,
  deniedDocumentAccess,
  type HostDeps,
  isHostUnmatched,
} from "./host.ts";

const ORIGIN = "https://lite.sfab.dev";

function stubCtx(): ExecutionContext {
  return {
    waitUntil() {
      // node:test has no isolate to wait on
    },
    passThroughOnException() {
      // node:test has no isolate exception plumbing
    },
    props: {},
  } as ExecutionContext;
}

function stubEnv(): Env {
  return {
    KERNEL_R2: {
      head: async () => null,
      get: async () => null,
    },
  } as unknown as Env;
}

const unauthorized = () =>
  Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

function testDeps(overrides: Partial<HostDeps> = {}): HostDeps {
  return {
    dispatchMcp: () => new Response("mcp-claimed", { status: 401 }),
    dispatchAgents: () => new Response("agents-claimed", { status: 404 }),
    dispatchInternal: () => new Response("internal-claimed", { status: 404 }),
    serveSubApp: async () => new Response("sub-claimed", { status: 200 }),
    createDb: () => ({}) as ReturnType<HostDeps["createDb"]>,
    resolveActor: async () => unauthorized(),
    requireAppAccess: async () => null,
    getWorkspaceAppId: async () => null,
    handleAuthServerMetadata: () =>
      new Response("auth-server-meta", { status: 200 }),
    ...overrides,
  };
}

const app = createHostApp(testDeps());

async function dispatch(
  path: string,
  init?: RequestInit
): Promise<Response | null> {
  const res = await app.fetch(
    new Request(`${ORIGIN}${path}`, init),
    stubEnv(),
    stubCtx()
  );
  if (isHostUnmatched(res)) {
    return null;
  }
  return res;
}

test("GET /r/button.json is a CORS-open registry item", async () => {
  const res = await dispatch("/r/button.json");
  assert.ok(res);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const item = (await res.json()) as { name: string };
  assert.equal(item.name, "button");
});

test("GET /mcp is claimed; GET /mcp/consent falls through to Start", async () => {
  const mcp = await dispatch("/mcp");
  assert.ok(mcp);
  assert.equal(mcp.status, 401);
  assert.equal(await mcp.text(), "mcp-claimed");

  assert.equal(await dispatch("/mcp/consent"), null);
  assert.equal(await dispatch("/mcp/"), null);
});

test("preview iframe without a session is 401 HTML, not 302", async () => {
  const res = await dispatch("/a/app_preview/preview/1", {
    headers: {
      Accept: "text/html",
      "Sec-Fetch-Dest": "iframe",
    },
  });
  assert.ok(res);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("location"), null);
  const html = await res.text();
  assert.equal(html.includes('target="_top"'), true);
  assert.equal(html.includes("Sign in required"), true);
});

test("prefix collisions and bare /internal are unmatched", async () => {
  assert.equal(await dispatch("/apiculture"), null);
  assert.equal(await dispatch("/agentship"), null);
  assert.equal(await dispatch("/internal"), null);
});

test("/internal/… and /agents are claimed; nested /r/ slugs stay registry", async () => {
  const internal = await dispatch("/internal/apps/x/attempts/y/run-create");
  assert.ok(internal);
  assert.equal(await internal.text(), "internal-claimed");

  const agents = await dispatch("/agents");
  assert.ok(agents);
  assert.equal(await agents.text(), "agents-claimed");

  const nested = await dispatch("/r/foo/bar.json");
  assert.ok(nested);
  assert.equal(nested.status, 404);

  assert.equal(await dispatch("/r/button"), null);
});

test("GET /kernel/… is claimed even when the path is unknown", async () => {
  const res = await dispatch("/kernel/nonsense");
  assert.ok(res);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "unknown kernel path\n");
});

test("handler 404s are not fallthrough", async () => {
  const unknownItem = await dispatch("/r/nope.json");
  assert.ok(unknownItem);
  assert.equal(unknownItem.status, 404);

  const workspace = await dispatch("/a/not-a-workspace/workspace");
  assert.ok(workspace);
  assert.equal(workspace.status, 404);
  const body = (await workspace.json()) as { error: string };
  assert.equal(body.error, "workspace_not_found");
});

test("deniedDocumentAccess: iframe 401 vs document 302 vs API 401", () => {
  const url = new URL(`${ORIGIN}/a/app_preview/preview/1`);
  const iframe = deniedDocumentAccess(
    new Request(url, {
      headers: { Accept: "text/html", "Sec-Fetch-Dest": "iframe" },
    }),
    url,
    unauthorized()
  );
  assert.equal(iframe.status, 401);
  assert.equal(iframe.headers.get("location"), null);

  const nav = deniedDocumentAccess(
    new Request(url, { headers: { Accept: "text/html" } }),
    url,
    unauthorized()
  );
  assert.equal(nav.status, 302);
  assert.equal(
    nav.headers.get("location"),
    `${ORIGIN}/signin?redirect=${encodeURIComponent(url.pathname)}`
  );

  const api = deniedDocumentAccess(new Request(url), url, unauthorized());
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("content-type")?.includes("json"), true);
});
