import { expandOid, readBlob, readCommit, resolveRef } from "isomorphic-git";
import type { ExecResult } from "just-bash";
import { createGitFs } from "../code-host/bare-browse.ts";
import type { GitWorkFs } from "../code-host/code-host.ts";

const LEADING_SLASHES = /^\/+/;
const WORKTREE = { dir: "/" } as const;

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): ExecResult {
  return { stdout: "", stderr, exitCode };
}

function isoFs(fs: GitWorkFs) {
  return createGitFs(fs);
}

async function resolveShowOid(
  fs: GitWorkFs,
  spec: string
): Promise<string | null> {
  const gitFs = isoFs(fs);
  try {
    return await resolveRef({ fs: gitFs, ...WORKTREE, ref: spec });
  } catch {
    // ignored — expandOid next
  }
  try {
    return await expandOid({ fs: gitFs, ...WORKTREE, oid: spec });
  } catch {
    return null;
  }
}

function formatCommit(
  oid: string,
  commit: {
    message: string;
    author: { name: string; email: string };
  }
): string {
  return `commit ${oid}\nAuthor: ${commit.author.name} <${commit.author.email}>\n\n    ${commit.message}\n`;
}

export async function gitShow(
  fs: GitWorkFs,
  rest: string[]
): Promise<ExecResult> {
  if (rest.some((a) => a.startsWith("-"))) {
    return fail("git show: flags are not supported in this shell\n");
  }
  if (rest.length > 1) {
    return fail(
      "git show: expected `git show` or `git show <rev>` or `git show <rev>:<path>`\n"
    );
  }
  const spec = rest[0] ?? "HEAD";
  const colon = spec.indexOf(":");
  const rev = colon === -1 ? spec : spec.slice(0, colon);
  const filepath = colon === -1 ? null : spec.slice(colon + 1);
  if (!rev) {
    return fail("git show: missing rev\n");
  }
  if (filepath !== null) {
    const normalized = filepath.replace(LEADING_SLASHES, "");
    if (!normalized || normalized.includes("..")) {
      return fail("git show: invalid path\n");
    }
    const oid = await resolveShowOid(fs, rev);
    if (!oid) {
      return fail(`git show: unknown revision '${rev}'\n`);
    }
    try {
      const { blob } = await readBlob({
        fs: isoFs(fs),
        ...WORKTREE,
        oid,
        filepath: normalized,
      });
      if (blob.includes(0)) {
        return fail("git show: binary file\n");
      }
      return ok(new TextDecoder().decode(blob));
    } catch {
      return fail(`git show: path '${normalized}' not in '${rev}'\n`);
    }
  }
  const oid = await resolveShowOid(fs, rev);
  if (!oid) {
    return fail(`git show: unknown revision '${rev}'\n`);
  }
  try {
    const { commit, oid: full } = await readCommit({
      fs: isoFs(fs),
      ...WORKTREE,
      oid,
    });
    return ok(formatCommit(full, commit));
  } catch {
    return fail(`git show: unknown revision '${rev}'\n`);
  }
}
