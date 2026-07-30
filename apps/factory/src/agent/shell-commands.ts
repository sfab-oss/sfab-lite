import { lintPasses } from "@sfab-lite/core";
import {
  type CommandContext,
  type CustomCommand,
  defineCommand,
  type ExecResult,
} from "just-bash";
import { nextMigrationPath } from "../apps/app-migrations.js";
import { liveAppDataStub } from "../apps/app-stub.js";
import { callCheck, callLint, checkPasses, getLiveSha } from "../forge/cd.js";
import { describeBlocking, diffSchema } from "../schema/schema-ddl.js";
import { probeSchema } from "../schema/schema-probe.js";
import {
  latestSnapshot,
  serializeSnapshot,
  snapshotPathFor,
} from "../schema/schema-snapshots.js";
import { createGhCommand } from "./gh-commands.js";
import { commitAllAndPushMain, runGitCommand } from "./git-commands.js";
import { isPlatformReadonlyPath } from "./platform-readonly.js";
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
}

async function runTypecheck(
  deps: ShellCommandDeps,
  ctx: CommandContext
): Promise<ExecResult> {
  const files = await collectWorkspaceSourceFiles(ctx);
  try {
    const check = await callCheck(deps.env, deps.appId, files);
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
  const probe = await probeSchema(deps.env, files);
  if (!probe.ok) {
    return fail(`db:generate: ${probe.error}\n`, 1);
  }

  const diff = diffSchema(latestSnapshot(files), probe.snapshot);

  if (diff.blocking.length > 0) {
    const reasons = diff.blocking
      .map((change) => `  - ${describeBlocking(change)}`)
      .join("\n");
    return fail(
      `db:generate: refused — this change cannot be made without losing data.\n${reasons}\n\nRestore what was removed, or migrate it by hand.\n`,
      1
    );
  }

  if (diff.statements.length === 0) {
    return ok("db:generate: no schema changes to migrate\n");
  }

  const name = args.find((arg) => !arg.startsWith("-")) ?? "schema";
  const path = nextMigrationPath(files, name);
  const snapshotPath = snapshotPathFor(path);
  await ctx.fs.writeFile(`/${path}`, `${diff.statements.join("\n")}\n`);
  await ctx.fs.writeFile(`/${snapshotPath}`, serializeSnapshot(probe.snapshot));
  const summary = diff.additive
    .map((change) => `  ${change.kind} ${change.table}`)
    .join("\n");
  return ok(`db:generate: wrote ${path} and ${snapshotPath}\n${summary}\n`);
}

const LOOPBACK_ORIGIN = "https://sfab-lite.internal";

async function runSeed(deps: ShellCommandDeps): Promise<ExecResult> {
  const liveSha = await getLiveSha(deps.env, deps.appId);
  if (!liveSha) {
    return fail(
      "seed: app has no live build yet — merge a PR to main first (gh pr merge)\n",
      1
    );
  }

  const stub = liveAppDataStub(deps.env, deps.appId);
  const { token, password } = await stub.seedCredentials();
  const path = `/a/${encodeURIComponent(deps.appId)}/api/dev/seed`;
  const res = await deps.env.SELF.fetch(
    new Request(`${LOOPBACK_ORIGIN}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sfab-seed": token,
      },
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

  return ok(
    `${body.seeded ? "seed: created the demo organization and sample rows" : "seed: already seeded — credentials unchanged"}\n\n` +
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
      return await runSeed(deps);
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
