import { createGit } from "@cloudflare/shell/git";
import type { CommandContext, ExecResult } from "just-bash";
import { bridgeBashFs } from "../bash-fs-bridge.js";
import { ensureLiveMatchesMain } from "../cd.js";
import { createR2CodeHost } from "../r2-code-host.js";
import { collectWorkspaceSourceFiles } from "./workspace-files.js";

const AUTHOR = { name: "sfab-agent", email: "agent@sfab.dev" };
const TOKEN_RE = /token[=:]\S+/gi;
const NOTHING_COMMIT_RE = /nothing to commit|No changes/i;

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): ExecResult {
  return { stdout: "", stderr, exitCode };
}

export interface GitCommandDeps {
  env: Env;
  appId: string;
}

function takeFlag(
  args: string[],
  name: string
): { present: boolean; rest: string[] } {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return { present: false, rest: args };
  }
  return {
    present: true,
    rest: [...args.slice(0, idx), ...args.slice(idx + 1)],
  };
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

type PushParse =
  | { ok: true; remote: string | null; branch: string }
  | { ok: false; error: string };

/**
 * Supported: `git push`, `git push origin`, `git push origin main`,
 * `git push origin HEAD:main`. Flags and other arities are rejected.
 */
function parsePushArgs(rest: string[]): PushParse {
  if (rest.some((a) => a.startsWith("-"))) {
    return {
      ok: false,
      error: "git push: flags are not supported in this shell\n",
    };
  }
  if (rest.length === 0) {
    return { ok: true, remote: null, branch: "main" };
  }
  if (rest.length === 1) {
    return { ok: true, remote: rest[0] ?? null, branch: "main" };
  }
  if (rest.length === 2) {
    const remote = rest[0] ?? "origin";
    const refspec = rest[1] ?? "main";
    if (refspec.includes(":")) {
      const colon = refspec.indexOf(":");
      const src = refspec.slice(0, colon);
      const dst = refspec.slice(colon + 1);
      if (!dst || dst.includes(":") || dst.includes("*")) {
        return {
          ok: false,
          error: `git push: unsupported refspec '${refspec}'\n`,
        };
      }
      if (src !== "" && src !== "HEAD" && src !== dst) {
        return {
          ok: false,
          error: `git push: unsupported refspec '${refspec}' (only HEAD:<branch> or <branch>:<branch>)\n`,
        };
      }
      return { ok: true, remote, branch: dst };
    }
    return { ok: true, remote, branch: refspec };
  }
  return {
    ok: false,
    error:
      "git push: unsupported arguments (use `git push`, `git push origin`, or `git push origin <branch>`)\n",
  };
}

async function afterMainPushCd(
  deps: GitCommandDeps,
  ctx: CommandContext,
  signal?: AbortSignal
): Promise<ExecResult | null> {
  const files = await collectWorkspaceSourceFiles(ctx);
  const result = await ensureLiveMatchesMain(deps.env, deps.appId, files, {
    signal,
  });
  if (result.status === "cd_failed") {
    return fail(
      `cd: failed after push (${result.error})\n${JSON.stringify(result.detail ?? {}, null, 2)}\n`,
      1
    );
  }
  return null;
}

async function gitStatus(
  git: ReturnType<typeof createGit>
): Promise<ExecResult> {
  const entries = await git.status();
  const lines = entries
    .filter((e) => e.status !== "unmodified")
    .map((e) => `${e.status.padEnd(12)} ${e.filepath}`);
  return ok(`${lines.join("\n")}${lines.length ? "\n" : ""}`);
}

async function gitCommit(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  const m = takeOption(rest, "-m");
  if (!m.value) {
    return fail("git commit: -m <message> required\n", 1);
  }
  const { oid, message } = await git.commit({
    message: m.value,
    author: AUTHOR,
  });
  return ok(`[main ${oid.slice(0, 7)}] ${message}\n`);
}

async function gitLog(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  const depthOpt = takeOption(rest, "-n");
  const depth = depthOpt.value ? Number(depthOpt.value) : 10;
  const entries = await git.log({
    depth: Number.isFinite(depth) ? depth : 10,
  });
  const text = entries
    .map(
      (e) =>
        `commit ${e.oid}\nAuthor: ${e.author.name} <${e.author.email}>\n\n    ${e.message}\n`
    )
    .join("\n");
  return ok(text);
}

async function gitBranch(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  const del = takeOption(rest, "-d");
  if (del.value) {
    await git.branch({ delete: del.value });
    return ok(`Deleted branch ${del.value}\n`);
  }
  if (rest[0] && !rest[0].startsWith("-")) {
    await git.branch({ name: rest[0] });
    return ok(`Created branch ${rest[0]}\n`);
  }
  const listed = await git.branch({ list: true });
  if ("branches" in listed && listed.branches) {
    const lines = listed.branches.map((b) =>
      b === listed.current ? `* ${b}` : `  ${b}`
    );
    return ok(`${lines.join("\n")}\n`);
  }
  return ok("");
}

async function gitCheckout(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  const newBranch = takeFlag(rest, "-b");
  if (newBranch.present) {
    const name = newBranch.rest[0];
    if (!name) {
      return fail("git checkout -b: missing branch name\n", 1);
    }
    await git.checkout({ branch: name });
    return ok(`Switched to a new branch '${name}'\n`);
  }
  const ref = rest[0];
  if (!ref) {
    return fail("git checkout: missing ref\n", 1);
  }
  await git.checkout({ ref });
  return ok(`Checked out ${ref}\n`);
}

async function gitRemote(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  if (rest[0] === "add" && rest[1] && rest[2]) {
    await git.remote({ add: { name: rest[1], url: rest[2] } });
    return ok(`added remote ${rest[1]}\n`);
  }
  if (rest[0] === "remove" && rest[1]) {
    await git.remote({ remove: rest[1] });
    return ok(`removed remote ${rest[1]}\n`);
  }
  const remotes = await git.remote({ list: true });
  if (Array.isArray(remotes)) {
    return ok(
      `${remotes.map((r) => `${r.remote}\t${r.url}`).join("\n")}${remotes.length ? "\n" : ""}`
    );
  }
  return ok("");
}

async function gitPush(
  deps: GitCommandDeps,
  ctx: CommandContext,
  rest: string[]
): Promise<ExecResult> {
  const parsed = parsePushArgs(rest);
  if (!parsed.ok) {
    return fail(parsed.error, 1);
  }
  const { branch } = parsed;
  const fs = bridgeBashFs(ctx.fs);
  const host = createR2CodeHost(deps.env);
  await host.credentialsForAgent(deps.appId);
  const pushed = await host.receivePush(deps.appId, fs, {
    dir: "/",
    ref: branch,
  });
  const refLine = pushed.advancedMain
    ? `push: ${branch} updated${pushed.sha ? ` (${pushed.sha.slice(0, 12)})` : ""}\n`
    : `push: ${branch} unchanged\n`;

  if (branch !== "main") {
    return ok(refLine);
  }

  const cdFail = await afterMainPushCd(deps, ctx, ctx.signal ?? undefined);
  if (cdFail) {
    return {
      stdout: refLine,
      stderr: cdFail.stderr,
      exitCode: cdFail.exitCode,
    };
  }
  const tip = pushed.sha ?? (await host.tipSha(deps.appId, "main"));
  if (tip) {
    return ok(`${refLine}cd: live matches main ${tip.slice(0, 12)}\n`);
  }
  return ok(refLine);
}

async function gitAdd(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  const path = rest[0] ?? ".";
  await git.add({ filepath: path });
  return ok(`added ${path}\n`);
}

async function gitRm(
  git: ReturnType<typeof createGit>,
  rest: string[]
): Promise<ExecResult> {
  const path = rest[0];
  if (!path) {
    return fail("git rm: missing path\n", 1);
  }
  await git.rm({ filepath: path });
  return ok(`removed ${path}\n`);
}

async function gitDiff(git: ReturnType<typeof createGit>): Promise<ExecResult> {
  const entries = await git.diff();
  const lines = entries.map((e) => `${e.status}\t${e.filepath}`);
  return ok(`${lines.join("\n")}${lines.length ? "\n" : ""}`);
}

async function gitInit(git: ReturnType<typeof createGit>): Promise<ExecResult> {
  await git.init({ defaultBranch: "main" });
  return ok("Initialized empty git repository\n");
}

async function gitCloneOrPull(
  deps: GitCommandDeps,
  ctx: CommandContext,
  cmd: string,
  rest: string[]
): Promise<ExecResult> {
  if (cmd === "clone" && !rest[0]) {
    return fail("git clone: missing url\n", 1);
  }
  const fs = bridgeBashFs(ctx.fs);
  const host = createR2CodeHost(deps.env);
  await host.credentialsForAgent(deps.appId);
  await host.cloneTo(deps.appId, fs, "/");
  if (cmd === "clone") {
    return ok("Cloned into workspace\n");
  }
  return ok(`${cmd}: updated workspace from origin\n`);
}

type GitFn = (
  git: ReturnType<typeof createGit>,
  rest: string[],
  deps: GitCommandDeps,
  ctx: CommandContext
) => Promise<ExecResult>;

const GIT_HANDLERS: Record<string, GitFn> = {
  status: (git) => gitStatus(git),
  add: (git, rest) => gitAdd(git, rest),
  rm: (git, rest) => gitRm(git, rest),
  commit: (git, rest) => gitCommit(git, rest),
  log: (git, rest) => gitLog(git, rest),
  branch: (git, rest) => gitBranch(git, rest),
  checkout: (git, rest) => gitCheckout(git, rest),
  diff: (git) => gitDiff(git),
  init: (git) => gitInit(git),
  remote: (git, rest) => gitRemote(git, rest),
  clone: (_git, rest, deps, ctx) => gitCloneOrPull(deps, ctx, "clone", rest),
  fetch: (_git, rest, deps, ctx) => gitCloneOrPull(deps, ctx, "fetch", rest),
  pull: (_git, rest, deps, ctx) => gitCloneOrPull(deps, ctx, "pull", rest),
  push: (_git, rest, deps, ctx) => gitPush(deps, ctx, rest),
};

export async function runGitCommand(
  deps: GitCommandDeps,
  args: string[],
  ctx: CommandContext
): Promise<ExecResult> {
  const fs = bridgeBashFs(ctx.fs);
  const git = createGit(fs as never, "/");
  const [cmd, ...rest] = args;
  if (!cmd) {
    return fail("git: missing command\n", 1);
  }
  const handler = GIT_HANDLERS[cmd];
  if (!handler) {
    return fail(`git ${cmd}: not supported in this shell\n`, 1);
  }
  try {
    return await handler(git, rest, deps, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const scrubbed = msg.replace(TOKEN_RE, "token=***");
    return fail(`git ${cmd}: ${scrubbed}\n`, 1);
  }
}

export async function commitAllAndPushMain(
  deps: GitCommandDeps,
  ctx: CommandContext
): Promise<ExecResult> {
  if (ctx.signal?.aborted) {
    return fail("deploy: aborted before start\n", 124);
  }
  const fs = bridgeBashFs(ctx.fs);
  const git = createGit(fs as never, "/");
  try {
    await git.add({ filepath: "." });
    const status = await git.status();
    const dirty = status.some((e) => e.status !== "unmodified");
    if (dirty) {
      await git.commit({
        message: "chore: deploy from workspace",
        author: AUTHOR,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!NOTHING_COMMIT_RE.test(msg)) {
      return fail(`deploy: commit failed: ${msg}\n`, 1);
    }
  }

  const host = createR2CodeHost(deps.env);
  const pushed = await host.receivePush(deps.appId, fs, {
    dir: "/",
    ref: "main",
  });
  const refLine = pushed.advancedMain
    ? `deploy: main updated${pushed.sha ? ` (${pushed.sha.slice(0, 12)})` : ""}\n`
    : "deploy: main unchanged\n";

  const cdFail = await afterMainPushCd(deps, ctx, ctx.signal ?? undefined);
  if (cdFail) {
    return {
      stdout: refLine,
      stderr: cdFail.stderr,
      exitCode: cdFail.exitCode,
    };
  }
  const tip = pushed.sha ?? (await host.tipSha(deps.appId, "main"));
  if (tip) {
    return ok(`${refLine}deploy: live matches main ${tip.slice(0, 12)}\n`);
  }
  return ok(`${refLine}deploy: nothing to CD\n`);
}
