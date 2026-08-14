/**
 * Drive the throwaway exp worker while a heartbeat tail watcher runs.
 *
 * wrangler tail can go quiet without exiting. This driver:
 *   - starts scripts/watch-tail.mjs (heartbeats every 2s)
 *   - refuses to send traffic until a heartbeat says the watcher is alive
 *   - puts a unique ?run= on every URL
 *   - fails loud (TAIL_GAP) if HTTP finishes and no matching tail event arrives
 *   - bounces wrangler on a gap so a dead websocket cannot look like "still running"
 *
 *   node scripts/drive-exp-matrix.mjs --base-url https://sfab-lite-check-exp.<sub>.workers.dev --token $ADMIN_TOKEN
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const DEFAULT_PROGRAMS = [
  "union",
  "cheap-union",
  "server-unit",
  "accumulating-emit",
  "client-snapshot",
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) {
    return process.argv[i + 1];
  }
  return fallback;
}

const baseUrl = (
  arg("--base-url", "") ||
  process.env.EXP_BASE_URL ||
  ""
).replace(/\/$/, "");
const token = arg("--token", "") || process.env.ADMIN_TOKEN || "";
const n = Number(arg("--n", "50"));
const spaceMs = Number(arg("--space-ms", "2000"));
const tailWaitMs = Number(arg("--tail-wait-ms", "90000"));
const connectTimeoutMs = Number(arg("--connect-timeout-ms", "45000"));
const outDir = arg("--out", join(appRoot, ".tmp/exp-matrix"));
const programs = (arg("--programs", DEFAULT_PROGRAMS.join(",")) || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!(baseUrl && token)) {
  console.error("usage: --base-url <url> --token <ADMIN_TOKEN>");
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });
const tailDir = join(outDir, "tail");
const resultsPath = join(outDir, "results.jsonl");
const summaryPath = join(outDir, "summary.json");
mkdirSync(tailDir, { recursive: true });
writeFileSync(resultsPath, "");

const PATH = `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`;

function readStatus() {
  const p = join(tailDir, "status.json");
  if (!existsSync(p)) {
    return null;
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function loadEvents() {
  const p = join(tailDir, "events.jsonl");
  if (!existsSync(p)) {
    return [];
  }
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function eventMentionsRun(row, runId) {
  const parsed = row.event ?? {};
  const url = parsed?.event?.request?.url ?? parsed?.request?.url ?? "";
  if (typeof url === "string" && url.includes(`run=${runId}`)) {
    return true;
  }
  const logs = parsed?.logs ?? [];
  for (const log of logs) {
    const msg = Array.isArray(log.message)
      ? log.message.join(" ")
      : String(log.message ?? "");
    if (msg.includes(runId)) {
      return true;
    }
  }
  return false;
}

function assertWatcherAlive() {
  const st = readStatus();
  if (!st?.heartbeatAt) {
    throw new Error("tail watcher has no heartbeat yet");
  }
  const age = Date.now() - Date.parse(st.heartbeatAt);
  if (!st.running || age > 15_000) {
    throw new Error(
      `tail watcher dead: running=${st.running} heartbeat_age_ms=${age}`
    );
  }
  return st;
}

function startWatcher() {
  const child = spawn(
    process.execPath,
    [
      join(here, "watch-tail.mjs"),
      "--config",
      "wrangler.exp.jsonc",
      "--worker",
      "sfab-lite-check-exp",
      "--out",
      tailDir,
    ],
    {
      cwd: appRoot,
      env: { ...process.env, PATH },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code, signal) => {
    console.error(`WATCHER_EXIT code=${code} signal=${signal}`);
  });
  return child;
}

async function waitForHeartbeat(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = readStatus();
    if (st?.heartbeatAt && st.running && st.connected) {
      const age = Date.now() - Date.parse(st.heartbeatAt);
      if (age < 8000) {
        console.log(
          `TAIL_READY connected=${st.connected} events=${st.eventCount} restarts=${st.restarts}`
        );
        await sleep(2000);
        return st;
      }
    }
    await sleep(250);
  }
  throw new Error(`tail watcher did not heartbeat within ${timeoutMs}ms`);
}

async function postExp(name, runId) {
  const url = `${baseUrl}/exp/${name}?run=${encodeURIComponent(runId)}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Admin-Token": token },
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { httpStatus: res.status, ms: Date.now() - t0, body, error: null };
  } catch (e) {
    return {
      httpStatus: 0,
      ms: Date.now() - t0,
      body: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function waitForTailEvent(runId) {
  const t0 = Date.now();
  while (Date.now() - t0 < tailWaitMs) {
    const hit = loadEvents().find((row) => eventMentionsRun(row, runId));
    if (hit) {
      return hit;
    }
    await sleep(400);
  }
  return null;
}

function bounceWrangler() {
  const st = readStatus();
  if (st?.pid) {
    try {
      process.kill(st.pid, "SIGUSR1");
      console.error(`TAIL_BOUNCE watcherPid=${st.pid}`);
    } catch {
      console.error("TAIL_BOUNCE watcher already gone");
    }
  }
}

async function invokeOnce(name, attempt) {
  assertWatcherAlive();
  const runId = crypto.randomUUID();
  const http = await postExp(name, runId);
  const tail = await waitForTailEvent(runId);
  if (!tail) {
    console.error(`TAIL_GAP program=${name} run=${runId} attempt=${attempt}`);
    bounceWrangler();
    await sleep(2000);
    await waitForHeartbeat(connectTimeoutMs);
    return { name, runId, ...http, outcome: "tail_gap", tail: null };
  }
  const outcome = tail.outcome ?? "unknown";
  return { name, runId, ...http, outcome, tail };
}

async function driveProgram(name) {
  const rows = [];
  let i = 0;
  let gaps = 0;
  while (rows.filter((r) => r.outcome !== "tail_gap").length < n) {
    i += 1;
    if (i > n + 8) {
      throw new Error(`${name}: too many retries (gaps=${gaps})`);
    }
    const row = await invokeOnce(name, i);
    rows.push(row);
    appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
    console.log(
      `DRIVE ${name} ${rows.filter((r) => r.outcome !== "tail_gap").length}/${n} outcome=${row.outcome} http=${row.httpStatus} ms=${row.ms}`
    );
    if (row.outcome === "tail_gap") {
      gaps += 1;
      if (gaps > 5) {
        throw new Error(`${name}: tail kept going silent (${gaps} gaps)`);
      }
    }
    await sleep(spaceMs);
  }
  return rows;
}

function summarize(all) {
  const byProgram = {};
  for (const name of programs) {
    const rows = all.filter((r) => r.name === name && r.outcome !== "tail_gap");
    const gaps = all.filter((r) => r.name === name && r.outcome === "tail_gap");
    const ooms = rows.filter((r) => r.outcome === "exceededMemory");
    const oks = rows.filter((r) => r.outcome === "ok");
    byProgram[name] = {
      n: rows.length,
      ok: oks.length,
      exceededMemory: ooms.length,
      exception: rows.filter((r) => r.outcome === "exception").length,
      other: rows.filter(
        (r) =>
          r.outcome !== "ok" &&
          r.outcome !== "exceededMemory" &&
          r.outcome !== "exception"
      ).length,
      tailGaps: gaps.length,
      http200: rows.filter((r) => r.httpStatus === 200).length,
    };
  }
  return {
    at: new Date().toISOString(),
    baseUrl,
    n,
    byProgram,
    tail: readStatus(),
  };
}

const watcher = startWatcher();
function shutdown() {
  try {
    watcher.kill("SIGTERM");
  } catch {
    // already gone
  }
}
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

const all = [];
try {
  await waitForHeartbeat(connectTimeoutMs);
  const health = await fetch(`${baseUrl}/health`, {
    headers: { "X-Admin-Token": token },
    signal: AbortSignal.timeout(15_000),
  });
  const healthBody = await health.text();
  console.log(`HEALTH http=${health.status} body=${healthBody.slice(0, 200)}`);
  if (health.status !== 200) {
    throw new Error(`health failed: ${health.status} ${healthBody}`);
  }
  const denied = await fetch(`${baseUrl}/health`);
  if (denied.status !== 401) {
    throw new Error(`unset token must deny; got ${denied.status}`);
  }
  for (const name of programs) {
    const rows = await driveProgram(name);
    all.push(...rows);
  }
  const summary = summarize(all);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`SUMMARY ${JSON.stringify(summary.byProgram)}`);
} finally {
  shutdown();
}
