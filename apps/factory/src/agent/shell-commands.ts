import { lintPasses } from "@sfab-lite/core";
import {
  type CommandContext,
  type CustomCommand,
  defineCommand,
  type ExecResult,
} from "just-bash";
import { collectMigrations, nextMigrationPath } from "../app-migrations.js";
import {
  appStub,
  callCheck,
  callLint,
  checkPasses,
  runCommitAttempt,
} from "../commit.js";
import { describeBlocking, diffSchema } from "../schema-ddl.js";
import { probeSchema } from "../schema-probe.js";
import { renderCheckText, renderLintText } from "./render-diagnostics.js";
import { collectWorkspaceSourceFiles } from "./workspace-files.js";

const FROZEN_IMPORT_MAP_MSG = `This app runs on sfab-lite's frozen kernel import map — dependencies are pinned at the factory, not installed per app.
pnpm add / install are not available in this shell.
Use pnpm typecheck, pnpm lint, pnpm db:generate, and pnpm run deploy (or wrangler deploy) instead.
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
    const check = await callCheck(deps.env, deps.appId, files, true);
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
  const wrote: string[] = [];
  if (fix) {
    for (const f of lint.body.files) {
      if (f.formatted != null && f.formatChanged) {
        const abs = f.path.startsWith("/") ? f.path : `/${f.path}`;
        await ctx.fs.writeFile(abs, f.formatted);
        wrote.push(f.path);
      }
    }
  }
  const text = renderLintText(lint.body, {
    wroteFiles: wrote.length ? wrote : undefined,
  });
  if (!lintPasses(lint.body)) {
    return { stdout: text, stderr: "", exitCode: 1 };
  }
  return ok(text || "lint passed\n");
}

/**
 * Write the migration that closes the gap between the schema and the database.
 *
 * The agent does not author migration SQL — it edits `src/db/schema.ts`, and
 * this derives the DDL, the same division of labour `drizzle-kit generate`
 * gives a normal project. Deriving it is what makes the file trustworthy: a
 * hand-written migration can disagree with the schema it claims to implement,
 * and nothing would notice until a query failed.
 *
 * Refuses rather than guesses when the change is destructive. Dropping a column
 * or retyping one needs a human to say what happens to the rows, and there is
 * no prompt here to ask on.
 */
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

  const stub = appStub(deps.env, deps.appId);
  await stub.bootstrap(collectMigrations(files));
  const diff = diffSchema(await stub.introspectSchema(), probe.snapshot);

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
  await ctx.fs.writeFile(`/${path}`, `${diff.statements.join("\n")}\n`);
  const summary = diff.additive
    .map((change) => `  ${change.kind} ${change.table}`)
    .join("\n");
  return ok(`db:generate: wrote ${path}\n${summary}\n`);
}

/**
 * Await the commit on the agent turn (exit codes must be real). Justified
 * against DO limits: factory `limits.cpu_ms` is 300_000 and a commit is
 * measured at 10–24s. Unlike HTTP `waitUntil`, we must settle before returning
 * — but abort must still fail the attempt so bash timeout cannot leave it
 * pending until STALE_ATTEMPT_MS.
 */
async function runDeploy(
  deps: ShellCommandDeps,
  ctx: CommandContext
): Promise<ExecResult> {
  const files = await collectWorkspaceSourceFiles(ctx);
  const stub = appStub(deps.env, deps.appId);
  const live = await stub.getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return fail("deploy: app has no live version to publish from\n", 1);
  }
  if (ctx.signal?.aborted) {
    return fail("deploy: aborted before start\n", 124);
  }
  const start = await stub.startAttempt("commit", live.liveVersionId);
  if (!start.ok) {
    return fail(`deploy: attempt already in flight (${start.attemptId})\n`, 1);
  }

  const result = await runCommitAttempt(
    deps.env,
    deps.appId,
    start.attemptId,
    files,
    live.liveVersionId,
    { signal: ctx.signal }
  );

  if (result === "aborted") {
    return fail(`deploy: aborted (attempt ${start.attemptId})\n`, 124);
  }
  if (result === "pass") {
    return ok(`deploy: published successfully (attempt ${start.attemptId})\n`);
  }
  const { attempt } = await stub.getAttempt(start.attemptId);
  const detail =
    attempt?.payload == null
      ? "\n"
      : `\n${JSON.stringify(attempt.payload, null, 2)}\n`;
  const kind = result === "fail" ? "publish gate failed" : "publish error";
  return fail(`deploy: ${kind} (attempt ${start.attemptId})${detail}`, 1);
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
      return await runDeploy(deps, ctx);
    }
    return fail(
      `pnpm ${script}: not supported in this shell.\n${FROZEN_IMPORT_MAP_MSG}`,
      1
    );
  });

  const wrangler = defineCommand("wrangler", async (args, ctx) => {
    if (args[0] === "deploy") {
      return await runDeploy(deps, ctx);
    }
    return fail(
      "wrangler: only `wrangler deploy` is supported (alias of pnpm run deploy).\n",
      1
    );
  });

  return [pnpm, wrangler];
}
