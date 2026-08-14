/**
 * Long-session Workers tail that cannot fail silently.
 *
 * wrangler tail's stdout is block-buffered when piped (events sit in a buffer
 * and look like "still running"). This watcher talks to the tail API over a
 * WebSocket instead, heartbeats every 2s even with zero events, and reconnects
 * on close or SIGUSR1.
 *
 *   node scripts/watch-tail.mjs --worker sfab-lite-check-exp --out .tmp/tail-run
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const CF_API = "https://api.cloudflare.com/client/v4";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) {
    return process.argv[i + 1];
  }
  return fallback;
}

const worker = arg("--worker", "sfab-lite-check-exp");
const outDir = arg("--out", join(appRoot, ".tmp/tail-run"));
const heartbeatMs = Number(arg("--heartbeat-ms", "2000"));
const token = process.env.CLOUDFLARE_API_TOKEN ?? "";

mkdirSync(outDir, { recursive: true });
const statusPath = join(outDir, "status.json");
const eventsPath = join(outDir, "events.jsonl");
const wranglerLog = join(outDir, "wrangler.log");

const status = {
  pid: process.pid,
  wranglerPid: process.pid,
  running: true,
  connected: false,
  startedAt: new Date().toISOString(),
  heartbeatAt: null,
  lastEventAt: null,
  lastLineAt: null,
  eventCount: 0,
  restarts: 0,
  lastWranglerExit: null,
  lastLine: "",
  outcomes: {},
  exceededMemory: 0,
  tailId: null,
};

let shuttingDown = false;
let ws = null;
let tailId = null;
let accountId = null;

function writeStatus() {
  status.heartbeatAt = new Date().toISOString();
  writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}

function heartbeatLine() {
  const last = status.lastEventAt
    ? Math.round((Date.now() - Date.parse(status.lastEventAt)) / 1000)
    : null;
  return `TAIL_HEARTBEAT connected=${status.connected} running=${status.running} events=${status.eventCount} exceededMemory=${status.exceededMemory} last_event_age_s=${last ?? "none"} restarts=${status.restarts} wranglerPid=${status.wranglerPid ?? "none"}`;
}

function noteLine(source, text) {
  const line = String(text).replace(/\s+/g, " ").trim();
  if (!line) {
    return;
  }
  status.lastLine = line.slice(0, 240);
  status.lastLineAt = new Date().toISOString();
  appendFileSync(
    wranglerLog,
    `[${new Date().toISOString()}] ${source} ${line}\n`
  );
}

function recordEvent(parsed) {
  status.connected = true;
  status.eventCount += 1;
  status.lastEventAt = new Date().toISOString();
  const outcome = parsed?.outcome ?? parsed?.event?.outcome ?? "unknown";
  status.outcomes[outcome] = (status.outcomes[outcome] ?? 0) + 1;
  if (outcome === "exceededMemory") {
    status.exceededMemory += 1;
  }
  appendFileSync(
    eventsPath,
    `${JSON.stringify({ t: status.lastEventAt, outcome, event: parsed })}\n`
  );
  console.log(
    `TAIL_EVENT outcome=${outcome} events=${status.eventCount} exceededMemory=${status.exceededMemory}`
  );
}

function readWsData(data, onText) {
  if (typeof data === "string") {
    onText(data);
    return;
  }
  if (data instanceof ArrayBuffer) {
    onText(new TextDecoder().decode(data));
    return;
  }
  if (ArrayBuffer.isView(data)) {
    onText(new TextDecoder().decode(data));
    return;
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    data
      .text()
      .then(onText)
      .catch((e) => {
        noteLine("blob", e instanceof Error ? e.message : String(e));
      });
    return;
  }
  noteLine("ws", `unknown payload ${Object.prototype.toString.call(data)}`);
}

function handlePayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    noteLine("ws", raw);
    return;
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      recordEvent(item);
    }
    writeStatus();
    return;
  }
  recordEvent(parsed);
  writeStatus();
}

async function cf(path, init = {}) {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`${path} ${res.status} ${JSON.stringify(body.errors)}`);
  }
  return body.result;
}

async function resolveAccount() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    return process.env.CLOUDFLARE_ACCOUNT_ID;
  }
  const accounts = await cf("/accounts");
  const first = Array.isArray(accounts) ? accounts[0] : null;
  if (!first?.id) {
    throw new Error("no Cloudflare account on this token");
  }
  return first.id;
}

async function deleteTail() {
  if (!(accountId && tailId)) {
    return;
  }
  const id = tailId;
  tailId = null;
  try {
    await cf(`/accounts/${accountId}/workers/scripts/${worker}/tails/${id}`, {
      method: "DELETE",
    });
  } catch (e) {
    noteLine("delete", e instanceof Error ? e.message : String(e));
  }
}

function closeWs() {
  const current = ws;
  ws = null;
  status.connected = false;
  if (current) {
    try {
      current.close();
    } catch {
      // already closed
    }
  }
}

async function connectTail() {
  if (shuttingDown) {
    return;
  }
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN is not set");
  }
  accountId = accountId ?? (await resolveAccount());
  await deleteTail();
  const created = await cf(
    `/accounts/${accountId}/workers/scripts/${worker}/tails`,
    { method: "POST", body: JSON.stringify({ filters: [] }) }
  );
  tailId = created.id;
  status.tailId = tailId;
  noteLine("api", `created tail ${tailId} expires ${created.expires_at}`);
  console.log(`TAIL_CREATED id=${tailId} expires=${created.expires_at}`);

  const socket = new WebSocket(created.url, ["trace-v1"]);
  socket.binaryType = "arraybuffer";
  ws = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ debug: false }));
    status.connected = true;
    writeStatus();
    console.log(
      `TAIL_CONNECTED worker=${worker} id=${tailId} protocol=${socket.protocol}`
    );
  });
  socket.addEventListener("message", (ev) => {
    readWsData(ev.data, handlePayload);
  });
  socket.addEventListener("error", (ev) => {
    noteLine("ws-error", ev.message ?? "websocket error");
    writeStatus();
  });
  socket.addEventListener("close", (ev) => {
    noteLine("ws-close", `code=${ev.code} reason=${ev.reason}`);
    status.connected = false;
    writeStatus();
    if (shuttingDown) {
      return;
    }
    status.restarts += 1;
    console.error(
      `TAIL_RESTART ws_close code=${ev.code} restart=${status.restarts}`
    );
    setTimeout(() => {
      connectTail().catch((e) => {
        console.error(
          `TAIL_RECONNECT_FAIL ${e instanceof Error ? e.message : e}`
        );
      });
    }, 1000);
  });
}

async function shutdown() {
  shuttingDown = true;
  status.running = false;
  writeStatus();
  closeWs();
  await deleteTail();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown().catch(() => process.exit(1));
});
process.on("SIGTERM", () => {
  shutdown().catch(() => process.exit(1));
});
process.on("SIGUSR1", () => {
  console.error("TAIL_BOUNCE_SIGNAL");
  closeWs();
  connectTail().catch((e) => {
    console.error(`TAIL_RECONNECT_FAIL ${e instanceof Error ? e.message : e}`);
  });
});

writeStatus();
console.log(`TAIL_START out=${outDir} worker=${worker} transport=websocket`);
setInterval(() => {
  writeStatus();
  console.log(heartbeatLine());
}, heartbeatMs);

connectTail().catch((e) => {
  console.error(`TAIL_CONNECT_FAIL ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
