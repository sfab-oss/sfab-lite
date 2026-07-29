import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import type {
  CodeHost,
  CodeHostCredentials,
  CodeHostRepo,
  GitWorkFs,
} from "./code-host.js";
import { remoteUrlFor } from "./code-host.js";
import { R2GitFs } from "./r2-git-fs.js";

const AUTHOR = { name: "sfab-lite", email: "forge@sfab.dev" };

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

async function readRef(fs: GitWorkFs, path: string): Promise<string | null> {
  if (!(await fs.exists(path))) {
    return null;
  }
  const raw = (await fs.readFile(path)).trim();
  if (raw.startsWith("ref:")) {
    const target = raw.slice(4).trim();
    return readRef(fs, target.startsWith("/") ? target : `/${target}`);
  }
  return raw || null;
}

async function copyTree(
  from: GitWorkFs,
  fromDir: string,
  to: GitWorkFs,
  toDir: string
): Promise<void> {
  if (!(await from.exists(fromDir))) {
    return;
  }
  const st = await from.lstat(fromDir);
  if (st.type === "file") {
    await to.writeFileBytes(toDir, await from.readFileBytes(fromDir));
    return;
  }
  await to.mkdir(toDir, { recursive: true });
  for (const name of await from.readdir(fromDir)) {
    if (name === "." || name === "..") {
      continue;
    }
    const src = fromDir === "/" ? `/${name}` : `${fromDir}/${name}`;
    const dest = toDir === "/" ? `/${name}` : `${toDir}/${name}`;
    await copyTree(from, src, to, dest);
  }
}

function asShellFs(fs: GitWorkFs) {
  return fs as unknown as Parameters<typeof createGit>[0];
}

function worktreeChildPath(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

function sourceKeyFromAbs(path: string): string | null {
  const key = path.startsWith("/") ? path.slice(1) : path;
  return key || null;
}

async function enqueueDirChildren(
  fs: GitWorkFs,
  path: string,
  queue: string[]
): Promise<void> {
  for (const name of await fs.readdir(path)) {
    if (name === "." || name === ".." || name === ".git") {
      continue;
    }
    queue.push(worktreeChildPath(path, name));
  }
}

async function collectWorktreeFiles(
  fs: GitWorkFs,
  dir = "/"
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const queue = [dir];

  while (queue.length > 0) {
    const path = queue.pop() as string;
    if (!(await fs.exists(path))) {
      continue;
    }
    const st = await fs.lstat(path);
    if (st.type === "file") {
      const key = sourceKeyFromAbs(path);
      if (key) {
        files[key] = await fs.readFile(path);
      }
      continue;
    }
    if (st.type === "directory") {
      await enqueueDirChildren(fs, path, queue);
    }
  }

  return files;
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
        const git = createGit(asShellFs(fs), "/");
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
      const fs = bareFs(appId);
      return await readRef(fs, `/refs/heads/${ref}`);
    },

    async cloneTo(
      appId: string,
      targetFs: GitWorkFs,
      dir = "/"
    ): Promise<{ sha: string | null }> {
      await this.ensureRepo(appId);
      const bare = bareFs(appId);
      const gitRoot = dir === "/" ? "/.git" : `${dir}/.git`;
      const git = createGit(asShellFs(targetFs), dir);
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
        try {
          await git.checkout({ ref: "main", force: true });
        } catch {
          // Empty tip (no commit yet) — workspace stays empty checkout.
        }
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
      const work = new InMemoryFs() as unknown as GitWorkFs;
      const git = createGit(asShellFs(work), "/");
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
      const workSha = await readRef(sourceFs, `${gitRoot}/refs/heads/${ref}`);
      if (!workSha) {
        return { advancedMain: false, sha: null };
      }
      const bare = bareFs(appId);
      const prev = await readRef(bare, `/refs/heads/${ref}`);
      await copyTree(sourceFs, `${gitRoot}/objects`, bare, "/objects");
      await bare.mkdir("/refs/heads", { recursive: true });
      await bare.writeFile(`/refs/heads/${ref}`, `${workSha}\n`);
      await bare.writeFile("/HEAD", `ref: refs/heads/${ref}\n`);
      const advancedMain = ref === "main" && prev !== workSha;
      return { advancedMain, sha: workSha };
    },

    async readTreeAt(
      appId: string,
      sha: string
    ): Promise<Record<string, string> | null> {
      await this.ensureRepo(appId);
      const bare = bareFs(appId);
      const work = new InMemoryFs() as unknown as GitWorkFs;
      const git = createGit(asShellFs(work), "/");
      await git.init({ defaultBranch: "main" });
      await copyTree(bare, "/objects", work, "/.git/objects");
      await copyTree(bare, "/refs", work, "/.git/refs");
      if (await bare.exists("/HEAD")) {
        await work.writeFile("/.git/HEAD", await bare.readFile("/HEAD"));
      }
      try {
        await git.checkout({ ref: sha, force: true });
      } catch {
        return null;
      }
      return await collectWorktreeFiles(work);
    },
  };
}
