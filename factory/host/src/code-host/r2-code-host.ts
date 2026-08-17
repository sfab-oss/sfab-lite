import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import {
  listBranches as gitListBranches,
  isDescendent,
  resolveRef,
} from "isomorphic-git";
import { z } from "zod";
import { createGitFs, listPathsInBare, readFileInBare } from "./bare-browse.js";
import type {
  CodeHost,
  CodeHostCredentials,
  CodeHostRepo,
  GitWorkFs,
} from "./code-host.js";
import { remoteUrlFor } from "./code-host.js";
import { copyTree, mapLimit } from "./copy-tree.js";
import { R2GitFs } from "./r2-git-fs.js";

const AUTHOR = { name: "sfab-lite", email: "forge@sfab.dev" };
const TRAILING_SLASH = /\/$/;
const treePathsSchema = z.array(z.string());
const BARE = { dir: "/", gitdir: "/" } as const;
const TREE_READ_CONCURRENCY = 16;

function treePathsKey(appId: string, sha: string): string {
  return `tree-index/${appId}/${sha}.json`;
}

function repoPrefix(appId: string): string {
  return `repos/${appId}/`;
}

function tokenKey(appId: string): string {
  return `tokens/${appId}`;
}

function mintToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function resolveRefOrNull(
  fs: GitWorkFs,
  ref: string,
  gitdir = "/"
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

async function readTreeFiles(
  bare: GitWorkFs,
  sha: string
): Promise<Record<string, string> | null> {
  const paths = await listPathsInBare(bare, sha);
  if (!paths) {
    return null;
  }
  const files: Record<string, string> = {};
  await mapLimit(paths, TREE_READ_CONCURRENCY, async (path) => {
    const content = await readFileInBare(bare, sha, path);
    if (content != null) {
      files[path] = content;
    }
  });
  return files;
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

export function createR2CodeHost(env: Env): CodeHost {
  const bucket = env.CODE_R2;

  function bareFs(appId: string): R2GitFs {
    return new R2GitFs(bucket, repoPrefix(appId));
  }

  return {
    async ensureRepo(appId: string): Promise<CodeHostRepo> {
      const fs = bareFs(appId);
      if (!(await fs.exists("/HEAD"))) {
        const git = createGit(fs, "/");
        await git.init({ defaultBranch: "main" });
        // Convert to bare layout: move .git/* to root if init created nested .git
        if (await fs.exists("/.git/HEAD")) {
          await copyTree(fs, "/.git", fs, "/");
          await fs.rm("/.git", { recursive: true, force: true });
        }
        if (!(await fs.exists("/HEAD"))) {
          await fs.writeFile("/HEAD", "ref: refs/heads/main\n");
        }
        const token = mintToken();
        await bucket.put(tokenKey(appId), token);
      } else if (!(await bucket.head(tokenKey(appId)))) {
        await bucket.put(tokenKey(appId), mintToken());
      }
      return { remoteUrl: remoteUrlFor(appId), repoId: appId };
    },

    async credentialsForAgent(appId: string): Promise<CodeHostCredentials> {
      await this.ensureRepo(appId);
      const obj = await bucket.get(tokenKey(appId));
      const token = obj ? await obj.text() : mintToken();
      if (!obj) {
        await bucket.put(tokenKey(appId), token);
      }
      return { username: "agent", token };
    },

    async tipSha(appId: string, ref = "main"): Promise<string | null> {
      return await resolveRefOrNull(bareFs(appId), `refs/heads/${ref}`);
    },

    async listBranches(appId: string): Promise<string[]> {
      await this.ensureRepo(appId);
      const names = await gitListBranches({
        fs: createGitFs(bareFs(appId)),
        ...BARE,
      });
      return names.sort((a, b) => a.localeCompare(b));
    },

    async cloneTo(
      appId: string,
      targetFs: GitWorkFs,
      dir = "/"
    ): Promise<{ sha: string | null }> {
      await this.ensureRepo(appId);
      const bare = bareFs(appId);
      const gitRoot = dir === "/" ? "/.git" : `${dir}/.git`;
      const git = createGit(targetFs, dir);
      await git.init({ defaultBranch: "main" });
      await copyTree(bare, "/objects", targetFs, `${gitRoot}/objects`);
      await copyTree(bare, "/refs", targetFs, `${gitRoot}/refs`);
      if (await bare.exists("/HEAD")) {
        await targetFs.writeFile(
          `${gitRoot}/HEAD`,
          await bare.readFile("/HEAD")
        );
      }
      if (await bare.exists("/config")) {
        await targetFs.writeFile(
          `${gitRoot}/config`,
          await bare.readFile("/config")
        );
      }
      const sha = await this.tipSha(appId, "main");
      if (sha) {
        // Agent Workspace FS often cannot run isomorphic-git checkout
        // (silent empty catch left only `.git` and no `src/`).
        const files = await readTreeFiles(bare, sha);
        if (!files) {
          throw new Error(
            `cloneTo: checkout failed for ${appId} at ${sha.slice(0, 12)}`
          );
        }
        await writeTreeFiles(targetFs, files, dir);
      }
      await git.remote({
        add: { name: "origin", url: remoteUrlFor(appId) },
      });
      return { sha };
    },

    async commitTree(
      appId: string,
      files: Record<string, string>,
      message: string
    ): Promise<{ sha: string }> {
      await this.ensureRepo(appId);
      const work = new InMemoryFs();
      const git = createGit(work, "/");
      await git.init({ defaultBranch: "main" });
      for (const [path, content] of Object.entries(files)) {
        const abs = path.startsWith("/") ? path : `/${path}`;
        await work.writeFile(abs, content);
      }
      await git.add({ filepath: "." });
      const { oid } = await git.commit({ message, author: AUTHOR });
      await this.receivePush(appId, work, { dir: "/", ref: "main" });
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
      const gitRoot = dir === "/" ? "/.git" : `${dir}/.git`;
      const workSha = await resolveRefOrNull(
        sourceFs,
        `refs/heads/${ref}`,
        gitRoot
      );
      if (!workSha) {
        return { advancedMain: false, sha: null };
      }
      const bare = bareFs(appId);
      const prev = await resolveRefOrNull(bare, `refs/heads/${ref}`);
      await copyTree(sourceFs, `${gitRoot}/objects`, bare, "/objects");
      await bare.mkdir("/refs/heads", { recursive: true });
      await bare.writeFile(`/refs/heads/${ref}`, `${workSha}\n`);
      if (ref === "main") {
        await bare.writeFile("/HEAD", "ref: refs/heads/main\n");
      }
      const advancedMain = ref === "main" && prev !== workSha;
      return { advancedMain, sha: workSha };
    },

    async updateRef(
      appId: string,
      ref: string,
      sha: string
    ): Promise<{ previous: string | null }> {
      await this.ensureRepo(appId);
      const bare = bareFs(appId);
      const previous = await resolveRefOrNull(bare, `refs/heads/${ref}`);
      await bare.mkdir("/refs/heads", { recursive: true });
      await bare.writeFile(`/refs/heads/${ref}`, `${sha}\n`);
      if (ref === "main") {
        await bare.writeFile("/HEAD", "ref: refs/heads/main\n");
      }
      return { previous };
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
      try {
        return await isDescendent({
          fs: createGitFs(bareFs(appId)),
          ...BARE,
          oid: descendantSha,
          ancestor: ancestorSha,
        });
      } catch {
        return false;
      }
    },

    async readTreeAt(
      appId: string,
      sha: string
    ): Promise<Record<string, string> | null> {
      await this.ensureRepo(appId);
      return await readTreeFiles(bareFs(appId), sha);
    },

    async listPathsAt(appId: string, sha: string): Promise<string[] | null> {
      await this.ensureRepo(appId);
      const cacheKey = treePathsKey(appId, sha);
      const cached = await bucket.get(cacheKey);
      if (cached) {
        try {
          const parsed = treePathsSchema.safeParse(
            JSON.parse(await cached.text())
          );
          if (parsed.success) {
            return parsed.data;
          }
        } catch {
          // fall through to walk
        }
      }
      const paths = await listPathsInBare(bareFs(appId), sha);
      if (paths) {
        await bucket.put(cacheKey, JSON.stringify(paths));
      }
      return paths;
    },

    async readFileAt(
      appId: string,
      sha: string,
      path: string
    ): Promise<string | null> {
      await this.ensureRepo(appId);
      return await readFileInBare(bareFs(appId), sha, path);
    },
  };
}
