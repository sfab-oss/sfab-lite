/**
 * Serve a sub-app at /a/:appId/* (live), /a/:appId/preview/:prNumber/*
 * (PR preview_sha), or /a/:workspaceId/workspace/* (AppAgent WIP compile).
 *
 * Live pointer is D1 `live_sha` → immutable build in CODE_R2.
 * Preview is per-PR: pull_request.preview_sha → BuildStore by sha.
 * Workspace is ephemeral R2 `builds/{workspaceId}/workspace.json` from AppAgent.
 * AppDataDO is runtime SQLite only (seed credentials + SQL), keyed by
 * `${appId}:live`, `${appId}:pr:N`, or `${workspaceId}:ws`.
 */
import { SERVER_SURFACE_HASH } from "@sfab-lite/kernel";
import { getAgentByName } from "agents";
import type { AppBuild } from "../code-host/build-store.js";
import { createR2BuildStore } from "../code-host/r2-build-store.js";
import { createR2CodeHost } from "../code-host/r2-code-host.js";
import type { AppDataDO } from "../durable-objects/app-data-do.js";
import { getLiveSha } from "../forge/cd.js";
import { getPullRequestByNumber } from "../forge/forge.js";
import { liveDataId, prDataId, wsDataId } from "../registry/app-data-ids.js";
import {
  type AppMigration,
  collectMigrations,
} from "../registry/app-migrations.js";
import { appDataStub } from "../registry/app-stub.js";
import { getWorkspaceBuild } from "../registry/workspace-build.js";
import { kernelModules } from "./kernel-modules.js";

const LEADING_SLASHES_RE = /^\/+/;

function contentType(path: string): string {
  if (path.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (path.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (path.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

/** Discriminated serve identity — never overload appId as workspaceId. */
export type ServeTarget =
  | { mode: "live"; appId: string }
  | { mode: "preview"; appId: string; prNumber: number }
  | { mode: "workspace"; workspaceId: string };

function serveId(target: ServeTarget): string {
  return target.mode === "workspace" ? target.workspaceId : target.appId;
}

function dataIdFor(target: ServeTarget): string {
  if (target.mode === "workspace") {
    return wsDataId(target.workspaceId);
  }
  if (target.mode === "preview") {
    return prDataId(target.appId, target.prNumber);
  }
  return liveDataId(target.appId);
}

type LoadBuildResult =
  | {
      ok: true;
      build: AppBuild;
      generation?: number;
      migrations?: AppMigration[];
    }
  | {
      ok: false;
      error:
        | "preview_not_open"
        | "no_preview_build"
        | "no_live_build"
        | "no_workspace_build"
        | "workspace_compile_failed";
      detail?: string;
    };

async function loadBuild(
  env: Env,
  target: ServeTarget
): Promise<LoadBuildResult> {
  if (target.mode === "workspace") {
    return loadWorkspaceBuild(env, target.workspaceId);
  }

  if (target.mode === "preview") {
    const { appId, prNumber } = target;
    const pr = await getPullRequestByNumber(env, appId, prNumber);
    if (pr?.status !== "open") {
      return { ok: false, error: "preview_not_open" };
    }
    if (!pr.previewSha) {
      return { ok: false, error: "no_preview_build" };
    }
    const build = await createR2BuildStore(env).getBuild(appId, pr.previewSha);
    if (!build) {
      return { ok: false, error: "no_preview_build" };
    }
    return { ok: true, build };
  }

  const { appId } = target;
  const sha = await getLiveSha(env, appId);
  if (!sha) {
    return { ok: false, error: "no_live_build" };
  }
  const build = await createR2BuildStore(env).getBuild(appId, sha);
  if (!build) {
    return { ok: false, error: "no_live_build" };
  }
  return { ok: true, build };
}

async function loadWorkspaceBuild(
  env: Env,
  workspaceId: string
): Promise<LoadBuildResult> {
  let record = await getWorkspaceBuild(env, workspaceId);
  if (!record) {
    try {
      const agent = await getAgentByName(env.AppAgent, workspaceId);
      const status = await agent.compileWorkspaceNow();
      if (status.status === "error") {
        return {
          ok: false,
          error: "workspace_compile_failed",
          detail: status.error ?? undefined,
        };
      }
      record = await getWorkspaceBuild(env, workspaceId);
    } catch (e) {
      return {
        ok: false,
        error: "workspace_compile_failed",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
  if (!record) {
    return { ok: false, error: "no_workspace_build" };
  }
  return {
    ok: true,
    build: record.build,
    generation: record.generation,
    migrations: record.migrations,
  };
}

function pathPrefixFor(target: ServeTarget): string {
  if (target.mode === "workspace") {
    return `/a/${encodeURIComponent(target.workspaceId)}/workspace`;
  }
  if (target.mode === "preview") {
    return `/a/${encodeURIComponent(target.appId)}/preview/${target.prNumber}`;
  }
  return `/a/${encodeURIComponent(target.appId)}`;
}

function buildPathContext(
  request: Request,
  target: ServeTarget,
  restPath: string
): { rest: string; publicBase: string } {
  const url = new URL(request.url);
  const rest = restPath.replace(LEADING_SLASHES_RE, "");
  const pathPrefix = pathPrefixFor(target);
  return { rest, publicBase: `${url.origin}${pathPrefix}` };
}

/**
 * Ensure this serve target's AppDataDO has schema from the build's source.
 * Idempotent; covers the case where CD used advanceLive: false and left the
 * preview DO unmigrated until first serve.
 */
async function ensureDataMigrated(
  env: Env,
  appId: string,
  dataId: string,
  sha: string
): Promise<void> {
  const sourceFiles = await createR2CodeHost(env).readTreeAt(appId, sha);
  if (!sourceFiles) {
    return;
  }
  const migrations = collectMigrations(sourceFiles);
  if (migrations.length === 0) {
    return;
  }
  await appDataStub(env, dataId).bootstrap(migrations);
}

async function ensureWorkspaceDataMigrated(
  env: Env,
  dataId: string,
  migrations: AppMigration[]
): Promise<void> {
  if (migrations.length === 0) {
    return;
  }
  await appDataStub(env, dataId).bootstrap(migrations);
}

async function serveApiRoute(
  request: Request,
  env: Env,
  target: ServeTarget,
  build: AppBuild,
  rest: string,
  publicBase: string,
  stub: DurableObjectStub<AppDataDO>,
  generation?: number
): Promise<Response> {
  const secret = env.APP_BETTER_AUTH_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "APP_BETTER_AUTH_SECRET missing on host" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const innerUrl = new URL(`/${rest}${url.search}`, url.origin);
  const id = serveId(target);
  const workerKey =
    target.mode === "workspace"
      ? `ws:${id}:workspace:${generation ?? build.sha}`
      : `app:${id}:${target.mode}:${target.mode === "preview" ? target.prNumber : "live"}:${build.sha}`;

  const worker = env.LOADER.get(workerKey, async () => ({
    compatibilityDate: "2026-07-23",
    compatibilityFlags: ["nodejs_compat"],
    mainModule: "index.js",
    modules: {
      ...kernelModules(),
      "index.js": build.serverBundle,
    },
    env: {
      DB: stub,
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: new URL(publicBase).origin,
      APP_BASE_PATH: pathPrefixFor(target),
      SEED_TOKEN: (await stub.seedCredentials()).token,
    },
    globalOutbound: null,
  }));

  const headers = new Headers(request.headers);
  headers.set("Origin", url.origin);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  return worker.getEntrypoint().fetch(new Request(innerUrl, init));
}

function resolveStaticAsset(
  build: AppBuild,
  rest: string
): { assetKey: string; body: string } | null {
  let assetKey = rest === "" || rest.endsWith("/") ? "index.html" : rest;
  if (assetKey.startsWith("./")) {
    assetKey = assetKey.slice(2);
  }

  let body = build.assets[assetKey];
  if (body == null && !assetKey.includes(".")) {
    body = build.assets["index.html"];
    assetKey = "index.html";
  }
  if (body == null) {
    return null;
  }

  return { assetKey, body };
}

function injectPublicBase(body: string, publicBase: string): string {
  const boot = `<script>window.__SFAB_PUBLIC_BASE__=${JSON.stringify(publicBase)};</script>`;
  if (body.includes("</head>")) {
    return body.replace("</head>", `${boot}</head>`);
  }
  return boot + body;
}

function serveStaticAsset(
  build: AppBuild,
  rest: string,
  publicBase: string
): Response {
  const resolved = resolveStaticAsset(build, rest);
  if (!resolved) {
    const assetKey = rest === "" || rest.endsWith("/") ? "index.html" : rest;
    return new Response(`not found: ${assetKey}`, { status: 404 });
  }

  let { assetKey, body } = resolved;
  if (assetKey === "index.html") {
    body = injectPublicBase(body, publicBase);
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType(assetKey),
      "cache-control":
        assetKey === "index.html" ? "no-store" : "public, max-age=60",
    },
  });
}

function serveErrorFields(
  target: ServeTarget
): Record<string, string | number> {
  if (target.mode === "workspace") {
    return { workspaceId: target.workspaceId };
  }
  if (target.mode === "preview") {
    return { appId: target.appId, prNumber: target.prNumber };
  }
  return { appId: target.appId };
}

async function bootstrapServeData(
  env: Env,
  target: ServeTarget,
  dataId: string,
  build: AppBuild,
  migrations?: AppMigration[]
): Promise<Response | null> {
  if (target.mode === "preview") {
    try {
      await ensureDataMigrated(env, target.appId, dataId, build.sha);
    } catch {
      return Response.json(
        {
          ok: false,
          error: "preview_schema_bootstrap_failed",
          appId: target.appId,
          prNumber: target.prNumber,
        },
        { status: 500 }
      );
    }
    return null;
  }
  if (target.mode !== "workspace") {
    return null;
  }
  if (!Array.isArray(migrations)) {
    return Response.json(
      {
        ok: false,
        error: "workspace_schema_bootstrap_failed",
        workspaceId: target.workspaceId,
        detail: "migrations_missing_from_build",
      },
      { status: 500 }
    );
  }
  try {
    await ensureWorkspaceDataMigrated(env, dataId, migrations);
  } catch {
    return Response.json(
      {
        ok: false,
        error: "workspace_schema_bootstrap_failed",
        workspaceId: target.workspaceId,
      },
      { status: 500 }
    );
  }
  return null;
}

export async function serveSubApp(
  request: Request,
  env: Env,
  target: ServeTarget,
  restPath: string
): Promise<Response> {
  if (target.mode === "preview" && target.prNumber < 1) {
    return Response.json(
      { ok: false, error: "preview_pr_required", appId: target.appId },
      { status: 404 }
    );
  }

  const dataId = dataIdFor(target);
  const stub = env.APP_DATA_DO.get(env.APP_DATA_DO.idFromName(dataId));
  const loaded = await loadBuild(env, target);

  if (!loaded.ok) {
    const status =
      loaded.error === "workspace_compile_failed" ||
      loaded.error === "no_workspace_build"
        ? 503
        : 404;
    return Response.json(
      {
        ok: false,
        error: loaded.error,
        ...serveErrorFields(target),
        ...(loaded.detail == null ? {} : { detail: loaded.detail }),
      },
      { status }
    );
  }

  const { build, generation, migrations } = loaded;

  if (
    build.serverSurfaceHash != null &&
    build.serverSurfaceHash !== SERVER_SURFACE_HASH
  ) {
    return Response.json(
      {
        ok: false,
        error: "server_surface_mismatch",
        ...serveErrorFields(target),
        sha: build.sha,
        buildServerSurface: build.serverSurfaceHash,
        hostServerSurface: SERVER_SURFACE_HASH,
      },
      { status: 409 }
    );
  }

  const bootstrapError = await bootstrapServeData(
    env,
    target,
    dataId,
    build,
    migrations
  );
  if (bootstrapError) {
    return bootstrapError;
  }

  const { rest, publicBase } = buildPathContext(request, target, restPath);

  const withShaHeader = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set("X-Sfab-Live-Sha", build.sha);
    headers.set("X-Sfab-Serve", target.mode);
    if (target.mode === "preview") {
      headers.set("X-Sfab-Preview-Pr", String(target.prNumber));
    }
    if (generation != null) {
      headers.set("X-Sfab-Workspace-Generation", String(generation));
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };

  if (rest === "api" || rest.startsWith("api/")) {
    const res = await serveApiRoute(
      request,
      env,
      target,
      build,
      rest,
      publicBase,
      stub,
      generation
    );
    return withShaHeader(res);
  }

  return withShaHeader(serveStaticAsset(build, rest, publicBase));
}
