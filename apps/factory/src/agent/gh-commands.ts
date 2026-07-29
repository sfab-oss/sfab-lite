import { createGit } from "@cloudflare/shell/git";
import {
  type CommandContext,
  type CustomCommand,
  defineCommand,
  type ExecResult,
} from "just-bash";
import { bridgeBashFs } from "../bash-fs-bridge.js";
import {
  createPullRequest,
  getCheckRun,
  getPullRequestByNumber,
  listCheckRuns,
  listPullRequests,
  mergePullRequest,
  prDiffSummary,
  rerunCheckRun,
} from "../forge.js";
import {
  formatCheckRuns,
  formatCheckRunView,
  formatPrList,
  formatPrView,
  parseGhArgs,
} from "./gh-cli-text.js";

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): ExecResult {
  return { stdout: "", stderr, exitCode };
}

export interface GhCommandDeps {
  env: Env;
  appId: string;
}

function takeOption(
  args: string[],
  name: string
): { value: string | null; rest: string[] } {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) {
    return { value: null, rest: args };
  }
  const value = args[idx + 1] ?? null;
  return {
    value,
    rest: [...args.slice(0, idx), ...args.slice(idx + 2)],
  };
}

async function currentBranch(ctx: CommandContext): Promise<string | null> {
  const fs = bridgeBashFs(ctx.fs);
  const git = createGit(fs as never, "/");
  const listed = await git.branch({ list: true });
  if ("current" in listed && typeof listed.current === "string") {
    return listed.current;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ghRunList(deps: GhCommandDeps): Promise<ExecResult> {
  const runs = await listCheckRuns(deps.env, deps.appId, { limit: 30 });
  return ok(formatCheckRuns(runs));
}

async function ghRunView(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const id = rest[0];
  if (!id) {
    return fail("gh run view: missing run id\n", 1);
  }
  const run = await getCheckRun(deps.env, deps.appId, id);
  if (!run) {
    return fail(`gh run view: run not found: ${id}\n`, 1);
  }
  return ok(formatCheckRunView(run));
}

async function ghRunWatch(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const id = rest[0];
  if (!id) {
    return fail("gh run watch: missing run id\n", 1);
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const run = await getCheckRun(deps.env, deps.appId, id);
    if (!run) {
      return fail(`gh run watch: run not found: ${id}\n`, 1);
    }
    if (run.status === "completed") {
      return ok(formatCheckRunView(run));
    }
    await sleep(1000);
  }
  const last = await getCheckRun(deps.env, deps.appId, id);
  if (!last) {
    return fail(`gh run watch: run not found: ${id}\n`, 1);
  }
  return {
    stdout: formatCheckRunView(last),
    stderr: "gh run watch: timed out after 30s (run still in progress)\n",
    exitCode: 1,
  };
}

async function ghRunRerun(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const id = rest[0];
  if (!id) {
    return fail("gh run rerun: missing run id\n", 1);
  }
  const run = await rerunCheckRun(deps.env, deps.appId, id);
  if (!run) {
    return fail(`gh run rerun: run not found: ${id}\n`, 1);
  }
  return ok(`Reran check run ${id} → ${run.id}\n${formatCheckRunView(run)}`);
}

async function ghPrList(deps: GhCommandDeps): Promise<ExecResult> {
  const prs = await listPullRequests(deps.env, deps.appId);
  return ok(formatPrList(prs));
}

async function ghPrView(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const n = Number(rest[0]);
  if (!Number.isFinite(n) || n < 1) {
    return fail("gh pr view: missing or invalid PR number\n", 1);
  }
  const pr = await getPullRequestByNumber(deps.env, deps.appId, n);
  if (!pr) {
    return fail(`gh pr view: PR #${n} not found\n`, 1);
  }
  return ok(formatPrView(pr));
}

async function ghPrChecks(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const n = Number(rest[0]);
  if (!Number.isFinite(n) || n < 1) {
    return fail("gh pr checks: missing or invalid PR number\n", 1);
  }
  const pr = await getPullRequestByNumber(deps.env, deps.appId, n);
  if (!pr) {
    return fail(`gh pr checks: PR #${n} not found\n`, 1);
  }
  const runs = await listCheckRuns(deps.env, deps.appId, {
    prId: pr.id,
    limit: 30,
  });
  return ok(formatCheckRuns(runs));
}

async function ghPrCreate(
  deps: GhCommandDeps,
  ctx: CommandContext,
  rest: string[]
): Promise<ExecResult> {
  const titleOpt = takeOption(rest, "--title");
  const bodyOpt = takeOption(titleOpt.rest, "--body");
  const headOpt = takeOption(bodyOpt.rest, "--head");
  if (!titleOpt.value) {
    return fail("gh pr create: --title is required\n", 1);
  }
  let head = headOpt.value;
  if (!head) {
    head = await currentBranch(ctx);
  }
  if (!head || head === "main") {
    return fail(
      "gh pr create: --head <branch> required (could not detect a non-main current branch)\n",
      1
    );
  }
  const result = await createPullRequest(deps.env, deps.appId, {
    title: titleOpt.value,
    body: bodyOpt.value,
    headBranch: head,
  });
  if (!result.ok) {
    return fail(`gh pr create: ${result.error}\n`, 1);
  }
  return ok(
    `Created pull request #${result.pr.number}\n${formatPrView(result.pr)}` +
      `Check run: ${result.checkRun.id}\n`
  );
}

async function ghPrDiff(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const n = Number(rest[0]);
  if (!Number.isFinite(n) || n < 1) {
    return fail("gh pr diff: missing or invalid PR number\n", 1);
  }
  const diff = await prDiffSummary(deps.env, deps.appId, n);
  if (!diff.ok) {
    return fail(`gh pr diff: ${diff.error}\n`, 1);
  }
  if (diff.changedPaths.length === 0) {
    return ok("(no file changes)\n");
  }
  return ok(`${diff.changedPaths.join("\n")}\n`);
}

async function ghPrMerge(
  deps: GhCommandDeps,
  rest: string[]
): Promise<ExecResult> {
  const n = Number(rest[0]);
  if (!Number.isFinite(n) || n < 1) {
    return fail("gh pr merge: missing or invalid PR number\n", 1);
  }
  const result = await mergePullRequest(deps.env, deps.appId, n);
  if (!result.ok) {
    const detail =
      result.detail == null
        ? ""
        : `\n${JSON.stringify(result.detail, null, 2)}\n`;
    return fail(`gh pr merge: ${result.error}${detail}`, 1);
  }
  return ok(
    `Merged pull request #${result.pr.number}\nlive ${result.liveSha.slice(0, 12)}\n`
  );
}

async function runGhCommand(
  deps: GhCommandDeps,
  args: string[],
  ctx: CommandContext
): Promise<ExecResult> {
  const parsed = parseGhArgs(args);
  if (!parsed.ok) {
    return fail(parsed.error, 1);
  }
  try {
    if (parsed.group === "run") {
      switch (parsed.action) {
        case "list":
          return await ghRunList(deps);
        case "view":
          return await ghRunView(deps, parsed.rest);
        case "watch":
          return await ghRunWatch(deps, parsed.rest);
        case "rerun":
          return await ghRunRerun(deps, parsed.rest);
        default:
          return fail(
            `gh run ${parsed.action}: not supported (list|view|watch|rerun)\n`,
            1
          );
      }
    }
    switch (parsed.action) {
      case "list":
        return await ghPrList(deps);
      case "view":
        return await ghPrView(deps, parsed.rest);
      case "checks":
        return await ghPrChecks(deps, parsed.rest);
      case "create":
        return await ghPrCreate(deps, ctx, parsed.rest);
      case "diff":
        return await ghPrDiff(deps, parsed.rest);
      case "merge":
        return await ghPrMerge(deps, parsed.rest);
      default:
        return fail(
          `gh pr ${parsed.action}: not supported (list|view|checks|create|diff|merge)\n`,
          1
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`gh ${parsed.group} ${parsed.action}: ${msg}\n`, 1);
  }
}

export function createGhCommand(deps: GhCommandDeps): CustomCommand {
  return defineCommand("gh", async (args, ctx) =>
    runGhCommand(deps, args, ctx)
  );
}
