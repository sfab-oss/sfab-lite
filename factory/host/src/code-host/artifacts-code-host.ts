import type { FileSystem } from "@cloudflare/shell";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import { listFiles, readBlob } from "isomorphic-git";
import { createGitFs } from "./bare-browse.ts";
import type { CodeHost, CodeHostRepo, GitWorkFs } from "./code-host.js";
import {
  createHttpGitRemote,
  type GitRemote,
  type GitSession,
  gitdirOf,
  resolveRefOrNull,
} from "./git-remote.ts";
import type { TreeStore } from "./tree-store.ts";
import { createTreeStore } from "./tree-store.ts";

const AUTHOR = { name: "sfab-lite", email: "forge@sfab.dev" };
const TRAILING_SLASH = /\/$/;
const TOKEN_TTL_SECONDS = 900;
const HEADS = "refs/heads/";

export type ArtifactsTokenScope = "read" | "write";

export interface ArtifactsRepoInfo {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  defaultBranch?: string;
  remote: string;
  token?: string;
}

export interface ArtifactsRepoHandle {
  info?: () => Promise<ArtifactsRepoInfo>;
  createToken: (
    scope?: ArtifactsTokenScope,
    ttl?: number
  ) => Promise<
    | string
    | { token: string }
    | { plaintext: string; expiresAt?: string | number }
  >;
}

export interface ArtifactsBinding {
  create: (
    name: string,
    opts?: { description?: string; setDefaultBranch?: string }
  ) => Promise<ArtifactsRepoInfo>;
  get: (name: string) => Promise<ArtifactsRepoHandle | ArtifactsRepoInfo>;
}

export interface ArtifactsCodeHostPorts {
  artifacts: ArtifactsBinding;
  trees: TreeStore;
  git?: GitRemote;
}

function unwrapToken(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.plaintext === "string" && rec.plaintext.length > 0) {
      return rec.plaintext;
    }
    if (typeof rec.token === "string" && rec.token.length > 0) {
      return rec.token;
    }
  }
  throw new Error("createToken: unexpected token shape");
}

function isHandle(
  value: ArtifactsRepoHandle | ArtifactsRepoInfo
): value is ArtifactsRepoHandle {
  return typeof (value as ArtifactsRepoHandle).createToken === "function";
}

async function repoInfo(
  value: ArtifactsRepoHandle | ArtifactsRepoInfo
): Promise<ArtifactsRepoInfo> {
  if (isHandle(value)) {
    if (typeof value.info === "function") {
      return await value.info();
    }
    throw new Error("ARTIFACTS.get: handle missing info()");
  }
  return value;
}

async function writeTreeFiles(
  fs: GitWorkFs,
  files: Record<string, string>,
  dir = "/"
): Promise<void> {
  const prefix = dir === "/" ? "" : dir.replace(TRAILING_SLASH, "");
  for (const [rel, content] of Object.entries(files)) {
    const abs = `${prefix}/${rel}`.replaceAll("//", "/");
    const lastSlash = abs.lastIndexOf("/");
    if (lastSlash > 0) {
      await fs.mkdir(abs.slice(0, lastSlash), { recursive: true });
    }
    await fs.writeFile(abs, content);
  }
}

async function treeFromGit(
  fs: FileSystem,
  sha: string,
  gitdir: string
): Promise<Record<string, string> | null> {
  const gitFs = createGitFs(fs);
  let paths: string[];
  try {
    paths = await listFiles({ fs: gitFs, dir: "/", gitdir, ref: sha });
  } catch {
    return null;
  }
  const files: Record<string, string> = {};
  for (const path of paths) {
    try {
      const { blob } = await readBlob({
        fs: gitFs,
        dir: "/",
        gitdir,
        oid: sha,
        filepath: path,
      });
      files[path] = new TextDecoder().decode(blob);
    } catch {
      /* skip unreadable blob */
    }
  }
  return files;
}

export function artifactsCodeHost(ports: ArtifactsCodeHostPorts): CodeHost {
  const { artifacts, trees } = ports;
  const git = ports.git ?? createHttpGitRemote();

  async function loadRepo(
    appId: string
  ): Promise<ArtifactsRepoHandle | ArtifactsRepoInfo | null> {
    try {
      const found = await artifacts.get(appId);
      return found ?? null;
    } catch {
      return null;
    }
  }

  async function mintToken(
    appId: string,
    scope: ArtifactsTokenScope
  ): Promise<GitSession> {
    const found = await loadRepo(appId);
    if (!found) {
      throw new Error(`mintToken: repo missing for ${appId}`);
    }
    if (!isHandle(found)) {
      throw new Error("mintToken: ARTIFACTS.get did not return a repo handle");
    }
    const info = await repoInfo(found);
    const token = unwrapToken(
      await found.createToken(scope, TOKEN_TTL_SECONDS)
    );
    return { remoteUrl: info.remote, token };
  }

  async function cacheTree(
    appId: string,
    sha: string,
    files: Record<string, string>
  ): Promise<void> {
    await trees.put(appId, sha, files);
  }

  async function treeAt(
    appId: string,
    sha: string,
    fs?: FileSystem,
    gitdir?: string
  ): Promise<Record<string, string> | null> {
    const cached = await trees.get(appId, sha);
    if (cached) {
      return cached;
    }
    if (!(fs && gitdir)) {
      return null;
    }
    const fromGit = await treeFromGit(fs, sha, gitdir);
    if (fromGit) {
      await cacheTree(appId, sha, fromGit);
    }
    return fromGit;
  }

  return {
    async ensureRepo(appId: string): Promise<CodeHostRepo> {
      const existing = await loadRepo(appId);
      if (existing) {
        const info = await repoInfo(existing);
        return { remoteUrl: info.remote, repoId: appId };
      }
      try {
        const created = await artifacts.create(appId, {
          setDefaultBranch: "main",
        });
        return { remoteUrl: created.remote, repoId: appId };
      } catch (cause) {
        const again = await loadRepo(appId);
        if (!again) {
          throw new Error(`ensureRepo: create failed for ${appId}`, { cause });
        }
        const info = await repoInfo(again);
        return { remoteUrl: info.remote, repoId: appId };
      }
    },

    async tipSha(appId: string, ref = "main"): Promise<string | null> {
      await this.ensureRepo(appId);
      const session = await mintToken(appId, "read");
      return await git.tip(session, ref);
    },

    async listBranches(appId: string): Promise<string[]> {
      await this.ensureRepo(appId);
      const session = await mintToken(appId, "read");
      const refs = await git.listRefs(session);
      return refs.map((r) => r.name);
    },

    async cloneTo(
      appId: string,
      targetFs: GitWorkFs,
      dir = "/"
    ): Promise<{ sha: string | null }> {
      const { remoteUrl } = await this.ensureRepo(appId);
      const session = await mintToken(appId, "read");
      const fetched = await git.fetchInto(session, targetFs, dir);
      const sha = fetched.sha ?? (await git.tip(session, "main"));
      if (sha) {
        const files = await treeAt(appId, sha, targetFs, gitdirOf(dir));
        if (!files) {
          throw new Error(
            `cloneTo: checkout failed for ${appId} at ${sha.slice(0, 12)}`
          );
        }
        await writeTreeFiles(targetFs, files, dir);
      }
      const shell = createGit(targetFs, dir);
      if (sha) {
        await shell.add({ filepath: "." });
      }
      try {
        await shell.remote({ add: { name: "origin", url: remoteUrl } });
      } catch {
        /* origin already present */
      }
      return { sha };
    },

    async commitTree(
      appId: string,
      files: Record<string, string>,
      message: string
    ): Promise<{ sha: string }> {
      await this.ensureRepo(appId);
      const work = new InMemoryFs();
      const shell = createGit(work, "/");
      await shell.init({ defaultBranch: "main" });
      const sessionRead = await mintToken(appId, "read");
      const parent = await git.tip(sessionRead, "main");
      if (parent) {
        await git.fetchInto(sessionRead, work, "/");
      }
      for (const [path, content] of Object.entries(files)) {
        const abs = path.startsWith("/") ? path : `/${path}`;
        const lastSlash = abs.lastIndexOf("/");
        if (lastSlash > 0) {
          await work.mkdir(abs.slice(0, lastSlash), { recursive: true });
        }
        await work.writeFile(abs, content);
      }
      await shell.add({ filepath: "." });
      const { oid } = await shell.commit({ message, author: AUTHOR });
      const sessionWrite = await mintToken(appId, "write");
      await git.push(sessionWrite, work, "/", "main");
      const committed = await treeFromGit(work, oid, "/.git");
      await cacheTree(appId, oid, committed ?? files);
      return { sha: oid };
    },

    async receivePush(
      appId: string,
      sourceFs: GitWorkFs,
      opts?: { dir?: string; ref?: string }
    ): Promise<{ advancedMain: boolean; sha: string | null }> {
      await this.ensureRepo(appId);
      const dir = opts?.dir ?? "/";
      const ref = opts?.ref ?? "main";
      const gitdir = gitdirOf(dir);
      const workSha = await resolveRefOrNull(
        sourceFs,
        `${HEADS}${ref}`,
        gitdir
      );
      if (!workSha) {
        return { advancedMain: false, sha: null };
      }
      const sessionRead = await mintToken(appId, "read");
      const prev = await git.tip(sessionRead, ref);
      const sessionWrite = await mintToken(appId, "write");
      await git.push(sessionWrite, sourceFs, dir, ref);
      const files = await treeFromGit(sourceFs, workSha, gitdir);
      if (!files) {
        throw new Error(
          `receivePush: could not read committed tree for ${workSha}`
        );
      }
      await cacheTree(appId, workSha, files);
      const advancedMain = ref === "main" && prev !== workSha;
      return { advancedMain, sha: workSha };
    },

    async updateRef(
      appId: string,
      ref: string,
      sha: string
    ): Promise<{ previous: string | null }> {
      await this.ensureRepo(appId);
      const session = await mintToken(appId, "write");
      const result = await git.updateRef(session, ref, sha);
      const cached = await trees.get(appId, sha);
      if (!cached) {
        const read = await mintToken(appId, "read");
        const scratch = new InMemoryFs();
        await git.fetchInto(read, scratch, "/");
        await treeAt(appId, sha, scratch, "/.git");
      }
      return result;
    },

    async isAncestor(
      appId: string,
      ancestorSha: string,
      descendantSha: string
    ): Promise<boolean> {
      if (ancestorSha === descendantSha) {
        return true;
      }
      await this.ensureRepo(appId);
      const session = await mintToken(appId, "read");
      return await git.isAncestor(session, ancestorSha, descendantSha);
    },

    async readTreeAt(
      appId: string,
      sha: string
    ): Promise<Record<string, string> | null> {
      const cached = await trees.get(appId, sha);
      if (cached) {
        return cached;
      }
      if (!(await loadRepo(appId))) {
        return null;
      }
      const session = await mintToken(appId, "read");
      const scratch = new InMemoryFs();
      await git.fetchInto(session, scratch, "/");
      return await treeAt(appId, sha, scratch, "/.git");
    },

    async listPathsAt(appId: string, sha: string): Promise<string[] | null> {
      const files = await this.readTreeAt(appId, sha);
      if (!files) {
        return null;
      }
      return Object.keys(files).sort((a, b) => a.localeCompare(b));
    },

    async readFileAt(
      appId: string,
      sha: string,
      path: string
    ): Promise<string | null> {
      const files = await this.readTreeAt(appId, sha);
      if (!files) {
        return null;
      }
      return files[path] ?? null;
    },
  };
}

export function createCodeHost(env: Env): CodeHost {
  if (env.ARTIFACTS == null) {
    throw new Error("createCodeHost: ARTIFACTS binding missing");
  }
  return artifactsCodeHost({
    artifacts: env.ARTIFACTS,
    trees: createTreeStore(env.CODE_R2),
  });
}
