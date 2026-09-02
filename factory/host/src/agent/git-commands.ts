import type { FileSystem } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import type { CommandContext, ExecResult } from "just-bash";
import { parsePushArgs } from "./git-push-args.ts";
import { gitShow } from "./git-show.ts";

const AUTHOR = { name: "sfab-agent", email: "agent@sfab.dev" };
const TOKEN_RE = /token[=:]\S+|art_v2_\S+/gi;

const MAIN_MERGE_ONLY =
  "main is merge-only. Push a feature branch, open a PR with `gh pr create`, wait for checks, then `gh pr merge`.\n";

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): ExecResult {
  return { stdout: "", stderr, exitCode };
}

async function codeHost(env: Env) {
  const { createCodeHost } = await import(
    "../code-host/artifacts-code-host.ts"
  );
  return createCodeHost(env);
}

export interface GitCommandDeps {
  env: Env;
  appId: string;
  /** Same view as AppAgent `#workspaceGit()` — not just-bash `ctx.fs`. */
  workspaceFs: FileSystem;
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
  rest: string[]
): Promise<ExecResult> {
  const parsed = parsePushArgs(rest);
  if (!parsed.ok) {
    return fail(parsed.error, 1);
  }
  const { branch } = parsed;
  if (branch === "main") {
    return fail(`git push: refused — ${MAIN_MERGE_ONLY}`, 1);
  }

  const host = await codeHost(deps.env);
  const pushed = await host.receivePush(deps.appId, deps.workspaceFs, {
    dir: "/",
    ref: branch,
  });
  const refLine = pushed.sha
    ? `push: ${branch} updated (${pushed.sha.slice(0, 12)})\n`
    : `push: ${branch} unchanged\n`;

  const { onBranchPushed } = await import("../forge/forge.ts");
  await onBranchPushed(deps.env, deps.appId, branch, pushed.sha);
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
  cmd: string,
  rest: string[]
): Promise<ExecResult> {
  if (cmd === "clone" && !rest[0]) {
    return fail("git clone: missing url\n", 1);
  }
  const host = await codeHost(deps.env);
  if (cmd === "clone") {
    await host.cloneTo(deps.appId, deps.workspaceFs, "/");
    return ok("Cloned into workspace\n");
  }
  await host.fetchGitdir(deps.appId, deps.workspaceFs, "/");
  return ok(`${cmd}: updated workspace from origin\n`);
}

type GitFn = (
  git: ReturnType<typeof createGit>,
  rest: string[],
  deps: GitCommandDeps
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
  show: (_git, rest, deps) => gitShow(deps.workspaceFs, rest),
  init: (git) => gitInit(git),
  remote: (git, rest) => gitRemote(git, rest),
  clone: (_git, rest, deps) => gitCloneOrPull(deps, "clone", rest),
  fetch: (_git, rest, deps) => gitCloneOrPull(deps, "fetch", rest),
  pull: (_git, rest, deps) => gitCloneOrPull(deps, "pull", rest),
  push: (_git, rest, deps) => gitPush(deps, rest),
};

export async function runGitCommand(
  deps: GitCommandDeps,
  args: string[],
  _ctx: CommandContext
): Promise<ExecResult> {
  const git = createGit(deps.workspaceFs, "/");
  const [cmd, ...rest] = args;
  if (!cmd) {
    return fail("git: missing command\n", 1);
  }
  const handler = GIT_HANDLERS[cmd];
  if (!handler) {
    return fail(`git ${cmd}: not supported in this shell\n`, 1);
  }
  try {
    return await handler(git, rest, deps);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const scrubbed = msg.replace(TOKEN_RE, "token=***");
    return fail(`git ${cmd}: ${scrubbed}\n`, 1);
  }
}

export function commitAllAndPushMain(
  _deps: GitCommandDeps,
  ctx: CommandContext
): Promise<ExecResult> {
  if (ctx.signal?.aborted) {
    return Promise.resolve(fail("deploy: aborted before start\n", 124));
  }
  return Promise.resolve(fail(`deploy: refused — ${MAIN_MERGE_ONLY}`, 1));
}
