import { lintPasses } from "@sfab-lite/core";
import { overlayFormatFiles } from "@sfab-lite/verbs/format";
import {
  type CommandContext,
  type CustomCommand,
  defineCommand,
  type ExecResult,
} from "just-bash";
import { callCheck, callLint, checkPasses, getLiveSha } from "../forge/cd.js";
import {
  collectMigrations,
  nextMigrationPath,
} from "../registry/app-migrations.js";
import { serveTargetAppDataStub } from "../registry/app-stub.js";
import {
  parseSeedTarget,
  pathPrefixForTarget,
} from "../registry/serve-target.js";
import {
  compileWorkspaceFiles,
  getWorkspaceBuild,
  putWorkspaceBuild,
  workspaceBuildSha,
} from "../registry/workspace-build.js";
import { classifySql, describeBlockingSql } from "../schema/classify-sql.js";
import { KIT_SQL_BREAKPOINT } from "../schema/schema-kit.js";
import { probeSchema } from "../schema/schema-probe.js";
import {
  appendJournalEntry,
  journalPath,
  latestSnapshot,
  serializeJournal,
  serializeSnapshot,
  snapshotPathFor,
} from "../schema/schema-snapshots.js";
import { createGhCommand } from "./gh-commands.js";
import { commitAllAndPushMain, runGitCommand } from "./git-commands.js";
import {
  isHostGeneratedPath,
  isPlatformReadonlyPath,
} from "./platform-readonly.js";
import { renderCheckText, renderLintText } from "./render-diagnostics.js";
import { collectWorkspaceSourceFiles } from "./workspace-files.js";

const FROZEN_IMPORT_MAP_MSG = `This app runs on sfab-lite's frozen kernel import map — dependencies are pinned at the factory, not installed per app.
pnpm add / install are not available in this shell.
Use pnpm typecheck, pnpm lint, pnpm db:generate, and pnpm seed.
Ship via a feature branch → gh pr create → checks → gh pr merge (main is merge-only; pnpm run deploy refuses).
`;

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): ExecResult {
  return { stdout: "", stderr, exitCode };
}

function refuseFrozen(cmd: string): ExecResult {
  return fail(`pnpm ${cmd}: refused.\n${FROZEN_IMPORT_MAP_MSG}`, 1);
}

export interface ShellCommandDeps {
  env: Env;
  appId: string;
  /** AppAgent DO name — computer pair for default `pnpm seed`. */
  workspaceId: string;
  /** Host bypass for generated format members (does not consult agent policy). */
  writeGenerated?: (path: string, content: string) => Promise<void>;
}

async function persistEmittedFiles(
  deps: ShellCommandDeps,
  ctx: CommandContext,
  emitted: Record<string, string> | undefined
): Promise<string[]> {
  if (!emitted) {
    return [];
  }
  const wrote: string[] = [];
  for (const [path, content] of Object.entries(emitted)) {
    const abs = path.startsWith("/") ? path : `/${path}`;
    if (isHostGeneratedPath(path) && deps.writeGenerated) {
      await deps.writeGenerated(abs, content);
      wrote.push(path);
      continue;
    }
    if (isPlatformReadonlyPath(path)) {
      continue;
    }
    await ctx.fs.writeFile(abs, content);
    wrote.push(path);
  }
  return wrote;
}

async function runTypecheck(
  deps: ShellCommandDeps,
  ctx: CommandContext
): Promise<ExecResult> {
  const files = await collectWorkspaceSourceFiles(ctx);
  try {
    const check = await callCheck(
      deps.env,
      deps.appId,
      overlayFormatFiles(files)
    );
    if (check.body?.ok) {
      await persistEmittedFiles(deps, ctx, check.body.emittedFiles);
    }
    const text = renderCheckText(check.body);
    if (check.http >= 500 || !check.body?.ok) {
      return fail(text || `typecheck: check worker HTTP ${check.http}\n`, 1);
    }
    if (!checkPasses(check.body)) {
      return { stdout: text, stderr: "", exitCode: 1 };
    }
    return ok(text || "typecheck passed\n");
  } catch (e) {
    return fail(
      `typecheck: ${e instanceof Error ? e.message : String(e)}\n`,
      1
    );
  }
}

async function writeLintFormatFixes(
  ctx: CommandContext,
  files: {
    path: string;
    formatted: string | null;
    formatChanged: boolean | null;
  }[]
): Promise<string[]> {
  const wrote: string[] = [];
  for (const f of files) {
    if (f.formatted == null || !f.formatChanged) {
      continue;
    }
    if (isPlatformReadonlyPath(f.path)) {
      continue;
    }
    const abs = f.path.startsWith("/") ? f.path : `/${f.path}`;
    await ctx.fs.writeFile(abs, f.formatted);
    wrote.push(f.path);
  }
  return wrote;
}

async function runLint(
  deps: ShellCommandDeps,
  ctx: CommandContext,
  fix: boolean
): Promise<ExecResult> {
  const files = await collectWorkspaceSourceFiles(ctx);
  const lint = await callLint(
    deps.env,
    deps.appId,
    files,
    fix ? "both" : "lint"
  );
  if (lint.http >= 500 || lint.body == null || lint.body.ok === false) {
    return fail(
      renderLintText(lint.body) || `lint: lint worker HTTP ${lint.http}\n`,
      1
    );
  }
  const wrote = fix ? await writeLintFormatFixes(ctx, lint.body.files) : [];
  const text = renderLintText(lint.body, {
    wroteFiles: wrote.length ? wrote : undefined,
  });
  if (!lintPasses(lint.body)) {
    return { stdout: text, stderr: "", exitCode: 1 };
  }
  return ok(text || "lint passed\n");
}

async function runDbGenerate(
  deps: ShellCommandDeps,
  ctx: CommandContext,
  args: string[]
): Promise<ExecResult> {
  const files = await collectWorkspaceSourceFiles(ctx);
  try {
    const tree = overlayFormatFiles(files);
    const prev = latestSnapshot(tree.files, tree.manifest);
    const probe = await probeSchema(deps.env, tree.files, tree.manifest, prev);
    if (!probe.ok) {
      return fail(`db:generate: ${probe.error}\n`, 1);
    }

    const diff = classifySql(probe.sql);

    if (diff.blocking.length > 0) {
      return fail(
        `db:generate: refused — this change cannot be applied without losing data — migrate by hand or restore.\n${describeBlockingSql(diff.blocking)}\n\nRestore what was removed, or migrate it by hand.\n`,
        1
      );
    }

    if (diff.additive.length === 0) {
      return ok("db:generate: no schema changes to migrate\n");
    }

    const name = args.find((arg) => !arg.startsWith("-")) ?? "schema";
    const path = nextMigrationPath(tree.files, tree.manifest, name);
    const snapshotPath = snapshotPathFor(path, tree.manifest);
    const fileName = path.slice(tree.manifest.migrations.length + 1);
    const tag = fileName.endsWith(".sql")
      ? fileName.slice(0, -".sql".length)
      : fileName;
    const journal = appendJournalEntry(
      tree.files,
      tree.manifest,
      tag,
      Date.now()
    );
    await ctx.fs.writeFile(
      `/${path}`,
      `${probe.sql.join(`${KIT_SQL_BREAKPOINT}\n`)}\n`
    );
    await ctx.fs.writeFile(
      `/${snapshotPath}`,
      serializeSnapshot(probe.snapshot)
    );
    await ctx.fs.writeFile(
      `/${journalPath(tree.manifest)}`,
      serializeJournal(journal)
    );
    return ok(
      `db:generate: wrote ${path}, ${snapshotPath}, and ${journalPath(tree.manifest)}\nRenames are drop+add in this generation and must be hand-migrated.\n`
    );
  } catch (e) {
    return fail(
      `db:generate: ${e instanceof Error ? e.message : String(e)}\n`,
      1
    );
  }
}

const LOOPBACK_ORIGIN = "https://sfab-lite.internal";

/**
 * Ensure a workspace WIP build exists without re-entering AppAgent (same DO
 * as this shell). Compiles from the bash VFS when R2 has no record yet.
 */
async function ensureWorkspaceBuildForSeed(
  deps: ShellCommandDeps,
  ctx: CommandContext
): Promise<ExecResult | null> {
  if (await getWorkspaceBuild(deps.env, deps.workspaceId)) {
    return null;
  }
  try {
    const files = await collectWorkspaceSourceFiles(ctx);
    const generation = Date.now();
    const { build, tree } = await compileWorkspaceFiles(
      files,
      workspaceBuildSha(generation)
    );
    const migrations = collectMigrations(tree.files, tree.manifest);
    await putWorkspaceBuild(deps.env, deps.workspaceId, {
      generation,
      build,
      migrations,
      at: Date.now(),
    });
    return null;
  } catch (e) {
    return fail(
      `seed: workspace compile failed — ${e instanceof Error ? e.message : String(e)}\n`,
      1
    );
  }
}

async function runSeed(
  deps: ShellCommandDeps,
  args: string[],
  ctx: CommandContext
): Promise<ExecResult> {
  const target = parseSeedTarget(deps, args);
  if ("error" in target) {
    return fail(target.error, 1);
  }

  if (target.mode === "live") {
    const liveSha = await getLiveSha(deps.env, deps.appId);
    if (!liveSha) {
      return fail(
        "seed --live: app has no live build yet — merge a PR to main first (gh pr merge)\n",
        1
      );
    }
  } else {
    const compileFail = await ensureWorkspaceBuildForSeed(deps, ctx);
    if (compileFail) {
      return compileFail;
    }
  }

  const stub = serveTargetAppDataStub(deps.env, target);
  const { token, password } = await stub.seedCredentials();
  const path = `${pathPrefixForTarget(target)}/api/dev/seed`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sfab-seed": token,
  };
  // Workspace/preview host gates require a factory actor. Loopback seed has
  // no session cookie; ADMIN_TOKEN is the established SELF/service pattern
  // (see forge/cd serviceHeaders). Live is public at the host, but send it
  // anyway when configured — SEED_TOKEN still authorizes the app route.
  if (target.mode !== "live") {
    const admin = deps.env.ADMIN_TOKEN?.trim();
    if (!admin) {
      return fail(
        "seed: ADMIN_TOKEN is not configured — required to seed a gated serve target (workspace/preview) via loopback\n",
        1
      );
    }
    headers["X-Admin-Token"] = admin;
  } else if (deps.env.ADMIN_TOKEN) {
    headers["X-Admin-Token"] = deps.env.ADMIN_TOKEN;
  }
  const res = await deps.env.SELF.fetch(
    new Request(`${LOOPBACK_ORIGIN}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ password }),
    })
  );

  if (!res.ok) {
    return fail(
      `seed: app returned HTTP ${res.status}\n${await res.text()}\n`,
      1
    );
  }

  const body = (await res.json()) as {
    seeded: boolean;
    email: string;
    organization: string;
  };

  const where =
    target.mode === "live"
      ? "live"
      : `computer workspace (${deps.workspaceId})`;

  return ok(
    `${body.seeded ? "seed: created the demo organization and sample rows" : "seed: already seeded — credentials unchanged"} (${where})\n\n` +
      `  organization  ${body.organization}\n` +
      `  email         ${body.email}\n` +
      `  password      ${password}\n`
  );
}

function parsePnpmInvocation(args: string[]): {
  kind: "refuse" | "script" | "error";
  name?: string;
  scriptArgs?: string[];
  message?: string;
} {
  const [head, ...rest] = args;
  if (!head) {
    return { kind: "error", message: "pnpm: missing command\n" };
  }
  if (head === "add" || head === "install" || head === "i") {
    return { kind: "refuse", name: head === "i" ? "install" : head };
  }
  if (head === "run") {
    if (!rest[0]) {
      return { kind: "error", message: "pnpm run: missing script name\n" };
    }
    return { kind: "script", name: rest[0], scriptArgs: rest.slice(1) };
  }
  return { kind: "script", name: head, scriptArgs: rest };
}

export function createAppShellCommands(
  deps: ShellCommandDeps
): CustomCommand[] {
  const pnpm = defineCommand("pnpm", async (args, ctx) => {
    const parsed = parsePnpmInvocation(args);
    if (parsed.kind === "error") {
      return fail(parsed.message ?? "pnpm: error\n", 1);
    }
    if (parsed.kind === "refuse") {
      return refuseFrozen(parsed.name ?? "unknown");
    }
    const script = parsed.name ?? "";
    const scriptArgs = parsed.scriptArgs ?? [];
    if (script === "typecheck") {
      return await runTypecheck(deps, ctx);
    }
    if (script === "lint") {
      const fix = scriptArgs.includes("--fix") || scriptArgs.includes("-w");
      return await runLint(deps, ctx, fix);
    }
    if (script === "db:generate") {
      return await runDbGenerate(deps, ctx, scriptArgs);
    }
    if (script === "deploy") {
      return await commitAllAndPushMain(deps, ctx);
    }
    if (script === "seed") {
      return await runSeed(deps, scriptArgs, ctx);
    }
    return fail(
      `pnpm ${script}: not supported in this shell.\n${FROZEN_IMPORT_MAP_MSG}`,
      1
    );
  });

  const wrangler = defineCommand("wrangler", async (args, ctx) => {
    if (args[0] === "deploy") {
      return await commitAllAndPushMain(deps, ctx);
    }
    return fail(
      "wrangler: only `wrangler deploy` is supported (refuses — main is merge-only).\n",
      1
    );
  });

  const git = defineCommand("git", async (args, ctx) =>
    runGitCommand(deps, args, ctx)
  );

  const gh = createGhCommand(deps);

  return [pnpm, wrangler, git, gh];
}
