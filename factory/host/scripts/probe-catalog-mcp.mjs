import {
  factoryFetch,
  factoryOrigin,
  readRpcBody,
} from "./probe-catalog-http.mjs";

function toolValue(rpc) {
  if (rpc?.error) {
    throw new Error(
      `probe-catalog — MCP ${rpc.error.message ?? JSON.stringify(rpc.error)}`
    );
  }
  const result = rpc?.result ?? {};
  if (result.isError) {
    const text = result.content?.[0]?.text;
    throw new Error(
      `probe-catalog — tool error: ${text ?? JSON.stringify(result)}`
    );
  }
  if (
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    return result.structuredContent;
  }
  const text = result.content?.[0]?.text;
  if (typeof text === "string" && text.length > 0) {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return result;
}

export function createMcpClient({
  origin,
  organizationId,
  adminToken,
  accessToken,
}) {
  const mcpUrl = `${origin}/mcp?organizationId=${encodeURIComponent(organizationId)}`;
  let sessionId = null;
  let nextId = 1;
  let initialized = false;

  function headers() {
    const h = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      origin,
    };
    if (adminToken) {
      h["X-Admin-Token"] = adminToken;
    } else if (accessToken) {
      h.Authorization = `Bearer ${accessToken}`;
    }
    if (sessionId) {
      h["mcp-session-id"] = sessionId;
    }
    return h;
  }

  async function rpc(method, params, { notification = false } = {}) {
    const payload = notification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: nextId++, method, params };
    const res = await factoryFetch(
      mcpUrl,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      },
      method === "tools/call" ? 180_000 : 60_000
    );
    const sid = res.headers.get("mcp-session-id");
    if (sid) {
      sessionId = sid;
    }
    if (notification) {
      return null;
    }
    const body = await readRpcBody(res);
    if (!res.ok && body?.error) {
      throw new Error(
        `probe-catalog — MCP HTTP ${res.status}: ${body.error.message ?? JSON.stringify(body.error)}`
      );
    }
    return body;
  }

  async function ensure() {
    if (initialized) {
      return;
    }
    const init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "probe-catalog", version: "0.1.0" },
    });
    if (init?.error) {
      throw new Error(
        `probe-catalog — initialize: ${init.error.message ?? JSON.stringify(init.error)}`
      );
    }
    await rpc("notifications/initialized", {}, { notification: true });
    initialized = true;
  }

  return {
    async callTool(name, args) {
      await ensure();
      const rpcBody = await rpc("tools/call", { name, arguments: args ?? {} });
      return toolValue(rpcBody);
    },
  };
}

export function mcpFromEnv(env, organizationId) {
  const origin = factoryOrigin(env);
  const adminToken = env.ADMIN_TOKEN || env.SFAB_ADMIN_TOKEN;
  const accessToken = env.SFAB_LITE_MCP_TOKEN;
  if (!(adminToken || accessToken)) {
    throw new Error(
      "probe-catalog — MCP needs ADMIN_TOKEN or SFAB_LITE_MCP_TOKEN"
    );
  }
  return createMcpClient({
    origin,
    organizationId,
    adminToken: adminToken || undefined,
    accessToken: adminToken ? undefined : accessToken,
  });
}
