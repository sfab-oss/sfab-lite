import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { mintMcpAccessToken, signInFactory } from "./probe-catalog-auth.mjs";
import {
  factoryFetch,
  factoryOrigin,
  readRpcBody,
} from "./probe-catalog-http.mjs";
import { createMcpClient } from "./probe-catalog-mcp.mjs";
import { mountOrgProtected, scoreTailEvents } from "./probe-catalog-lib.mjs";

export const NEVER_TOUCH_APP_IDS = new Set([
  "app_01M1J3576FDTZJS4ZQHRP4P271",
  "app_01M1JG9G7XJV1Q9TGGQCEDK4MJ",
]);

const NEVER_TOUCH_NAMES = new Set([
  "talk",
  "video demo",
  "grumpy toaster",
  "m3 erp",
]);

const ORG_INDEX = "/src/hono/org-protected/index.ts";
const RECIPE_PATHS = [
  "src/hono/org-protected/index.ts",
  "src/hono/org-protected/pdf-invoice.ts",
  "src/hono/org-protected/xlsx-export.ts",
  "src/pdf/invoice.ts",
  "src/xlsx/export.ts",
  "manifest.json",
];
const EXCLUDED_PREFIXES = [
  "/bin/",
  "/usr/",
  "/dev/",
  "/proc/",
  "/sys/",
  "/tmp/",
  "/.git/",
];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const watchTailScript = join(repoRoot, "check/scripts/watch-tail.mjs");

export function isProtectedApp(app) {
  if (!app) {
    return false;
  }
  if (app.id && NEVER_TOUCH_APP_IDS.has(app.id)) {
    return true;
  }
  const name = String(app.name ?? "")
    .trim()
    .toLowerCase();
  return NEVER_TOUCH_NAMES.has(name);
}

export function cloudflareTokenFromEnv(env) {
  if (env.CLOUDFLARE_API_TOKEN) {
    return env.CLOUDFLARE_API_TOKEN;
  }
  const toml = join(homedir(), ".config/.wrangler/config/default.toml");
  if (!existsSync(toml)) {
    return "";
  }
  const match = readFileSync(toml, "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? "";
}

function assertLiveEnv(env) {
  if (env.ADMIN_TOKEN || env.SFAB_ADMIN_TOKEN || env.SFAB_LITE_MCP_TOKEN) {
    return;
  }
  if (env.SFAB_LITE_EMAIL && env.SFAB_LITE_PASSWORD) {
    return;
  }
  throw new Error(
    "probe-catalog — --live needs ADMIN_TOKEN or SFAB_LITE_EMAIL + SFAB_LITE_PASSWORD"
  );
}

function bashText(result) {
  return `${result?.stdout ?? ""}${result?.stderr ?? ""}`;
}

function parseStatusPaths(stdout) {
  return String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\S+\s+/, "").trim())
    .filter((path) => path && path !== "." && path !== "/");
}

export function filePathsFromGlob(result) {
  const paths = result?.paths ?? [];
  const files = [];
  for (const entry of paths) {
    if (typeof entry === "string") {
      files.push(entry);
      continue;
    }
    if (entry && typeof entry === "object") {
      if (entry.type != null && entry.type !== "file") {
        continue;
      }
      if (typeof entry.path === "string") {
        files.push(entry.path);
      }
    }
  }
  return files;
}

function shouldCollect(path) {
  const abs = path.startsWith("/") ? path : `/${path}`;
  if (abs === "/" || abs === "/tmp" || abs === "/.git") {
    return false;
  }
  if (EXCLUDED_PREFIXES.some((root) => abs.startsWith(root))) {
    return false;
  }
  return true;
}

function sourceKey(path) {
  return path.startsWith("/") ? path.slice(1) : path;
}

export async function runLiveSequence(plan, ops) {
  const log = ops.log ?? ((line) => ops.io?.log?.(line));
  let appId = null;
  const shots = [];
  let pr = null;
  let scored = null;
  try {
    log("probe-catalog — create");
    const created = await ops.createApp({
      name: plan.appName,
      template: plan.template,
    });
    appId = created.appId ?? created.id;
    if (!appId) {
      throw new Error("probe-catalog — create returned no appId");
    }
    if (NEVER_TOUCH_APP_IDS.has(appId) || isProtectedApp(created)) {
      throw new Error(`probe-catalog — refused to use protected app ${appId}`);
    }
    log(`probe-catalog — app ${appId}`);
    await ops.waitReady(appId);

    for (const recipe of plan.recipes) {
      log(`probe-catalog — apps_add ${recipe}`);
      await ops.addRecipe(appId, recipe);
    }

    const index = await ops.readFile(appId, ORG_INDEX);
    if (typeof index !== "string") {
      throw new Error("probe-catalog — org-protected index missing");
    }
    const mounted = mountOrgProtected(index, plan.recipes);
    if (mounted !== index) {
      await ops.writeFile(appId, ORG_INDEX, mounted);
    }

    const branch = "feat/probe-catalog";
    await ops.bash(appId, `git checkout -b ${branch}`);
    const status = await ops.bash(appId, "git status");
    const dirty = parseStatusPaths(status.stdout);
    const toAdd = RECIPE_PATHS.filter(
      (path) => dirty.includes(path) || dirty.includes(`/${path}`)
    );
    const extras = dirty.filter(
      (path) =>
        !RECIPE_PATHS.includes(path.replace(/^\//, "")) &&
        path !== "." &&
        !path.startsWith("biome")
    );
    const addList = [...new Set([...toAdd, ...extras.map((p) => p.replace(/^\//, ""))])];
    if (addList.includes(".") || addList.length === 0) {
      if (addList.includes(".")) {
        throw new Error("probe-catalog — refused git add .");
      }
      for (const path of RECIPE_PATHS) {
        await ops.bash(appId, `git add ${path}`);
      }
    } else {
      for (const path of addList) {
        await ops.bash(appId, `git add ${path}`);
      }
    }
    await ops.bash(appId, 'git commit -m "probe: mount catalog recipes"');
    await ops.bash(appId, `git push origin ${branch}`);
    const createdPr = await ops.bash(
      appId,
      `gh pr create --title "probe catalog" --head ${branch}`
    );
    pr = bashText(createdPr);
    log("probe-catalog — hosted PR opened");

    await ops.startTail?.(plan);
    for (let i = 0; i < plan.nWarm; i += 1) {
      log(`probe-catalog — warm ${i + 1}/${plan.nWarm}`);
      const result = await ops.typecheckWarm(appId);
      shots.push({ band: "warm", i: i + 1, ...summarizeBash(result) });
      if (i + 1 < plan.nWarm && plan.spaceMs > 0) {
        await ops.sleep(plan.spaceMs);
      }
    }
    if (plan.nWarm > 0 && plan.nCold > 0 && plan.spaceMs > 0) {
      await ops.sleep(plan.spaceMs);
    }
    let files = null;
    for (let i = 0; i < plan.nCold; i += 1) {
      log(`probe-catalog — cold ${i + 1}/${plan.nCold}`);
      files = files ?? (await ops.collectFiles(appId));
      const result = await ops.typecheckCold(appId, files);
      shots.push({ band: "cold", i: i + 1, ...summarizeCold(result) });
      if (i + 1 < plan.nCold && plan.spaceMs > 0) {
        await ops.sleep(plan.spaceMs);
      }
    }
    const events = (await ops.stopTail?.()) ?? [];
    scored = scoreTailEvents(events);
  } finally {
    if (appId && !NEVER_TOUCH_APP_IDS.has(appId)) {
      log(`probe-catalog — delete ${appId}`);
      await ops.deleteApp(appId);
    }
  }
  return { appId, shots, pr, scored };
}

function summarizeBash(result) {
  return {
    passed: result?.passed ?? result?.exitCode === 0,
    exitCode: result?.exitCode ?? null,
    wallMs: result?.wallMs ?? null,
  };
}

function summarizeCold(result) {
  return {
    passed: Boolean(result?.ok && result?.publishGate !== false),
    wallMs: result?.wallMs ?? null,
    http: result?.http ?? null,
    checkAttempts: result?.check?.attempts ?? result?.checkAttempts ?? null,
  };
}

export async function runLiveProbe(plan, env, io, hooks = {}) {
  try {
    assertLiveEnv(env);
  } catch (err) {
    io.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  if (hooks.runLive) {
    return hooks.runLive(plan, env, io);
  }

  const origin = factoryOrigin(env, plan.factory);
  const organizationId = plan.org;
  const adminToken = env.ADMIN_TOKEN || env.SFAB_ADMIN_TOKEN || "";
  let cookie = "";
  let accessToken = env.SFAB_LITE_MCP_TOKEN || "";

  if (!adminToken && !accessToken) {
    io.log("probe-catalog — signing in to mint an MCP token");
    cookie = await signInFactory(env, origin);
    accessToken = await mintMcpAccessToken({
      origin,
      cookie,
      organizationId,
    });
  }

  const mcp = createMcpClient({
    origin,
    organizationId,
    adminToken: adminToken || undefined,
    accessToken: adminToken ? undefined : accessToken,
  });

  const cfToken = cloudflareTokenFromEnv(env);
  const tailDir = join(here, ".tmp", `probe-catalog-${Date.now()}`);
  let tailChild = null;

  const restHeaders = () => {
    const headers = { origin, "content-type": "application/json" };
    if (adminToken) {
      headers["X-Admin-Token"] = adminToken;
    } else if (cookie) {
      headers.cookie = cookie;
    } else {
      throw new Error("probe-catalog — REST check needs ADMIN_TOKEN or a session cookie");
    }
    return headers;
  };

  const livePlan = {
    ...plan,
    appName: plan.appName ?? `probe-catalog-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`,
    factory: origin,
  };

  const ops = {
    io,
    log: (line) => io.log(line),
    sleep,
    async createApp({ name, template }) {
      return mcp.callTool("apps_create", { name, template });
    },
    async waitReady(appId) {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const app = await mcp.callTool("apps_get", { appId });
        const status = app.status ?? app.app?.status;
        if (status === "ready") {
          return app;
        }
        if (status === "failed") {
          throw new Error(`probe-catalog — create failed for ${appId}`);
        }
        await sleep(3000);
      }
      throw new Error(`probe-catalog — timed out waiting for ${appId}`);
    },
    async addRecipe(appId, name) {
      return mcp.callTool("apps_add", { appId, name });
    },
    async readFile(appId, path) {
      const result = await mcp.callTool("workspace_read", { appId, path });
      return result.content ?? result.text ?? null;
    },
    async writeFile(appId, path, content) {
      return mcp.callTool("workspace_write", { appId, path, content });
    },
    async bash(appId, command) {
      const started = Date.now();
      const result = await mcp.callTool("bash", { appId, command });
      return { ...result, wallMs: Date.now() - started };
    },
    async typecheckWarm(appId) {
      return ops.bash(appId, "pnpm typecheck");
    },
    async collectFiles(appId) {
      const listed = await mcp.callTool("workspace_glob", {
        appId,
        pattern: "**/*",
      });
      const files = {};
      for (const path of filePathsFromGlob(listed)) {
        if (!shouldCollect(path)) {
          continue;
        }
        const abs = path.startsWith("/") ? path : `/${path}`;
        try {
          const result = await mcp.callTool("workspace_read", { appId, path: abs });
          const content = result.content ?? result.text;
          if (typeof content === "string") {
            files[sourceKey(abs)] = content;
          }
        } catch {
          // directories and missing paths are not source files
        }
      }
      return files;
    },
    async typecheckCold(appId, files) {
      const started = Date.now();
      const res = await factoryFetch(
        `${origin}/api/protected/apps/${encodeURIComponent(appId)}/check`,
        {
          method: "POST",
          headers: restHeaders(),
          body: JSON.stringify({ files, forceCold: true }),
        },
        180_000
      );
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 240) };
      }
      const wallMs = Date.now() - started;
      if (!res.ok) {
        return {
          ok: false,
          http: res.status,
          wallMs,
          publishGate: false,
          check: body,
        };
      }
      return { ...body, wallMs };
    },
    async startTail(currentPlan) {
      if (!cfToken) {
        io.log("probe-catalog — no CLOUDFLARE_API_TOKEN; scoring bash/check only");
        return;
      }
      mkdirSync(tailDir, { recursive: true });
      tailChild = spawn(
        process.execPath,
        [watchTailScript, "--worker", currentPlan.tailWorker, "--out", tailDir],
        {
          env: { ...process.env, CLOUDFLARE_API_TOKEN: cfToken },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const statusPath = join(tailDir, "status.json");
        if (existsSync(statusPath)) {
          try {
            const status = JSON.parse(readFileSync(statusPath, "utf8"));
            if (status.connected) {
              return;
            }
          } catch {
            // still opening
          }
        }
        await sleep(1000);
      }
      io.log("probe-catalog — tail did not connect; continuing");
    },
    async stopTail() {
      if (tailChild) {
        tailChild.kill("SIGTERM");
        tailChild = null;
        await sleep(1500);
      }
      const eventsPath = join(tailDir, "events.jsonl");
      if (!existsSync(eventsPath)) {
        return [];
      }
      return readFileSync(eventsPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
    async deleteApp(appId) {
      return mcp.callTool("apps_delete", { appId });
    },
  };

  const result = await runLiveSequence(livePlan, ops);
  const artifact = {
    when: new Date().toISOString(),
    plan: {
      org: livePlan.org,
      template: livePlan.template,
      recipes: livePlan.recipes,
      nWarm: livePlan.nWarm,
      nCold: livePlan.nCold,
      spaceMs: livePlan.spaceMs,
      tailWorker: livePlan.tailWorker,
    },
    appId: result.appId,
    deleted: true,
    pr: result.pr,
    shots: result.shots,
    tail: result.scored,
    kill: Boolean(result.scored?.kill),
  };
  const artifactPath = livePlan.artifactPath ?? livePlan.artifact;
  mkdirSync(dirname(join(process.cwd(), artifactPath)), { recursive: true });
  const absArtifact = artifactPath.startsWith("/")
    ? artifactPath
    : join(process.cwd(), artifactPath);
  mkdirSync(dirname(absArtifact), { recursive: true });
  writeFileSync(absArtifact, `${renderArtifact(artifact)}\n`);
  io.log(`probe-catalog — wrote ${absArtifact}`);
  io.log(JSON.stringify({ appId: result.appId, kill: artifact.kill, tail: result.scored }, null, 2));
  return artifact.kill ? 1 : 0;
}

function renderArtifact(artifact) {
  const lines = [
    `# probe-catalog ${artifact.when.slice(0, 10)}`,
    "",
    `- app: \`${artifact.appId}\` (deleted: ${artifact.deleted})`,
    `- recipes: ${artifact.plan.recipes.join(", ")}`,
    `- warm: ${artifact.plan.nWarm} · cold: ${artifact.plan.nCold} · spaceMs: ${artifact.plan.spaceMs}`,
    `- tail worker: ${artifact.plan.tailWorker}`,
    `- kill: ${artifact.kill}`,
    "",
    "## Tail score",
    "",
    "```json",
    JSON.stringify(artifact.tail, null, 2),
    "```",
    "",
    "## Shots",
    "",
    "```json",
    JSON.stringify(artifact.shots, null, 2),
    "```",
  ];
  return lines.join("\n");
}
