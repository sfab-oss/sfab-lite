import type { FileSystem } from "@cloudflare/shell";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import {
  clone,
  type HttpClient,
  isDescendent,
  listServerRefs,
  push,
  resolveRef,
} from "isomorphic-git";
import httpWeb from "isomorphic-git/http/web";
import { createGitFs } from "./bare-browse.ts";

const http: HttpClient = httpWeb;

export interface GitSession {
  remoteUrl: string;
  token: string;
}

export interface GitRemote {
  listRefs: (session: GitSession) => Promise<{ name: string; sha: string }[]>;
  tip: (session: GitSession, ref: string) => Promise<string | null>;
  push: (
    session: GitSession,
    sourceFs: FileSystem,
    dir: string,
    ref: string
  ) => Promise<{ sha: string | null }>;
  fetchInto: (
    session: GitSession,
    destFs: FileSystem,
    dir: string
  ) => Promise<{ sha: string | null }>;
  updateRef: (
    session: GitSession,
    ref: string,
    sha: string
  ) => Promise<{ previous: string | null }>;
  isAncestor: (
    session: GitSession,
    ancestorSha: string,
    descendantSha: string
  ) => Promise<boolean>;
}

const HEADS = "refs/heads/";

export function gitdirOf(dir: string): string {
  return dir === "/" ? "/.git" : `${dir}/.git`;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function auth(token: string) {
  return {
    headers: bearer(token),
    onAuth: () => ({ headers: bearer(token) }),
  };
}

export async function resolveRefOrNull(
  fs: FileSystem,
  ref: string,
  gitdir = "/.git"
): Promise<string | null> {
  try {
    return await resolveRef({
      fs: createGitFs(fs),
      dir: "/",
      gitdir,
      ref,
    });
  } catch {
    return null;
  }
}

async function listRefsHttp(
  session: GitSession
): Promise<{ name: string; sha: string }[]> {
  const refs = await listServerRefs({
    http,
    url: session.remoteUrl,
    ...auth(session.token),
  });
  return refs
    .filter((r) => r.ref.startsWith(HEADS))
    .map((r) => ({ name: r.ref.slice(HEADS.length), sha: r.oid }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function copyDir(
  from: FileSystem,
  fromDir: string,
  to: FileSystem,
  toDir: string
): Promise<void> {
  let names: string[];
  try {
    names = await from.readdir(fromDir);
  } catch {
    return;
  }
  await to.mkdir(toDir, { recursive: true });
  for (const name of names) {
    if (name === "." || name === "..") {
      continue;
    }
    const src = fromDir === "/" ? `/${name}` : `${fromDir}/${name}`;
    const dest = toDir === "/" ? `/${name}` : `${toDir}/${name}`;
    const st = await from.lstat(src);
    if (st.type === "directory") {
      await copyDir(from, src, to, dest);
    } else {
      await to.writeFileBytes(dest, await from.readFileBytes(src));
    }
  }
}

async function copyGit(
  from: FileSystem,
  fromGitdir: string,
  to: FileSystem,
  toGitdir: string
): Promise<void> {
  await copyDir(from, `${fromGitdir}/objects`, to, `${toGitdir}/objects`);
  await copyDir(from, `${fromGitdir}/refs`, to, `${toGitdir}/refs`);
  if (await from.exists(`${fromGitdir}/HEAD`)) {
    await to.mkdir(toGitdir, { recursive: true });
    await to.writeFile(
      `${toGitdir}/HEAD`,
      await from.readFile(`${fromGitdir}/HEAD`)
    );
  }
}

async function cloneScratch(session: GitSession): Promise<InMemoryFs> {
  const work = new InMemoryFs();
  await clone({
    fs: createGitFs(work),
    http,
    dir: "/",
    gitdir: "/.git",
    url: session.remoteUrl,
    noCheckout: true,
    singleBranch: false,
    ...auth(session.token),
  });
  return work;
}

async function setOrigin(
  destFs: FileSystem,
  dir: string,
  remoteUrl: string
): Promise<void> {
  const shell = createGit(destFs, dir);
  try {
    await shell.remote({ add: { name: "origin", url: remoteUrl } });
  } catch {
    /* origin already present */
  }
}

export function createHttpGitRemote(): GitRemote {
  return {
    async listRefs(session) {
      return await listRefsHttp(session);
    },

    async tip(session, ref) {
      const refs = await listRefsHttp(session);
      return refs.find((r) => r.name === ref)?.sha ?? null;
    },

    async push(session, sourceFs, dir, ref) {
      const gitdir = gitdirOf(dir);
      const sha = await resolveRefOrNull(sourceFs, `${HEADS}${ref}`, gitdir);
      if (!sha) {
        return { sha: null };
      }
      await push({
        fs: createGitFs(sourceFs),
        http,
        dir,
        gitdir,
        url: session.remoteUrl,
        ref,
        ...auth(session.token),
      });
      return { sha };
    },

    async fetchInto(session, destFs, dir) {
      const gitdir = gitdirOf(dir);
      const refs = await listRefsHttp(session);
      const main = refs.find((r) => r.name === "main");
      if (!main) {
        const shell = createGit(destFs, dir);
        if (!(await destFs.exists(`${gitdir}/HEAD`))) {
          await shell.init({ defaultBranch: "main" });
        }
        await setOrigin(destFs, dir, session.remoteUrl);
        return { sha: null };
      }
      const scratch = await cloneScratch(session);
      await copyGit(scratch, "/.git", destFs, gitdir);
      await destFs.mkdir(`${gitdir}/refs/heads`, { recursive: true });
      await destFs.writeFile(`${gitdir}/refs/heads/main`, `${main.sha}\n`);
      await destFs.writeFile(`${gitdir}/HEAD`, "ref: refs/heads/main\n");
      await setOrigin(destFs, dir, session.remoteUrl);
      return { sha: main.sha };
    },

    async updateRef(session, ref, sha) {
      const previous = await this.tip(session, ref);
      const scratch = await cloneScratch(session);
      await scratch.mkdir("/.git/refs/heads", { recursive: true });
      await scratch.writeFile(`/.git/refs/heads/${ref}`, `${sha}\n`);
      await push({
        fs: createGitFs(scratch),
        http,
        dir: "/",
        gitdir: "/.git",
        url: session.remoteUrl,
        ref,
        ...auth(session.token),
      });
      return { previous };
    },

    async isAncestor(session, ancestorSha, descendantSha) {
      if (ancestorSha === descendantSha) {
        return true;
      }
      const scratch = await cloneScratch(session);
      try {
        return await isDescendent({
          fs: createGitFs(scratch),
          dir: "/",
          gitdir: "/.git",
          oid: descendantSha,
          ancestor: ancestorSha,
        });
      } catch {
        return false;
      }
    },
  };
}
