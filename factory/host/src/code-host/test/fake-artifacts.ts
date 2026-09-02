import type { FileSystem } from "@cloudflare/shell";
import { InMemoryFs } from "@cloudflare/shell";
import { isDescendent } from "isomorphic-git";
import type {
  ArtifactsBinding,
  ArtifactsRepoHandle,
  ArtifactsRepoInfo,
  ArtifactsTokenScope,
} from "../artifacts-code-host.ts";
import { createGitFs } from "../bare-browse.ts";
import {
  type GitRemote,
  type GitSession,
  gitdirOf,
  resolveRefOrNull,
} from "../git-remote.ts";

const HEADS = "refs/heads/";
const NAMESPACE = "sfab-lite-apps";

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

export class MemoryGitRemote implements GitRemote {
  readonly #stores = new Map<string, InMemoryFs>();

  store(url: string): InMemoryFs {
    let fs = this.#stores.get(url);
    if (!fs) {
      fs = new InMemoryFs();
      this.#stores.set(url, fs);
    }
    return fs;
  }

  async listRefs(
    session: GitSession
  ): Promise<{ name: string; sha: string }[]> {
    const fs = this.store(session.remoteUrl);
    const gitdir = "/.git";
    let names: string[];
    try {
      names = await fs.readdir(`${gitdir}/refs/heads`);
    } catch {
      return [];
    }
    const refs: { name: string; sha: string }[] = [];
    for (const name of names) {
      const sha = await resolveRefOrNull(fs, `${HEADS}${name}`, gitdir);
      if (sha) {
        refs.push({ name, sha });
      }
    }
    return refs.sort((a, b) => a.name.localeCompare(b.name));
  }

  async tip(session: GitSession, ref: string): Promise<string | null> {
    return await resolveRefOrNull(
      this.store(session.remoteUrl),
      `${HEADS}${ref}`,
      "/.git"
    );
  }

  async push(
    session: GitSession,
    sourceFs: FileSystem,
    dir: string,
    ref: string
  ): Promise<{ sha: string | null }> {
    const gitdir = gitdirOf(dir);
    const sha = await resolveRefOrNull(sourceFs, `${HEADS}${ref}`, gitdir);
    if (!sha) {
      return { sha: null };
    }
    const dest = this.store(session.remoteUrl);
    await copyGit(sourceFs, gitdir, dest, "/.git");
    await dest.mkdir("/.git/refs/heads", { recursive: true });
    await dest.writeFile(`/.git/refs/heads/${ref}`, `${sha}\n`);
    if (ref === "main") {
      await dest.writeFile("/.git/HEAD", "ref: refs/heads/main\n");
    }
    return { sha };
  }

  async fetchInto(
    session: GitSession,
    destFs: FileSystem,
    dir: string
  ): Promise<{ sha: string | null }> {
    const destGit = gitdirOf(dir);
    const src = this.store(session.remoteUrl);
    if (!(await src.exists("/.git/HEAD"))) {
      return { sha: null };
    }
    await copyGit(src, "/.git", destFs, destGit);
    return {
      sha: await resolveRefOrNull(destFs, `${HEADS}main`, destGit),
    };
  }

  async updateRef(
    session: GitSession,
    ref: string,
    sha: string
  ): Promise<{ previous: string | null }> {
    const fs = this.store(session.remoteUrl);
    const previous = await resolveRefOrNull(fs, `${HEADS}${ref}`, "/.git");
    await fs.mkdir("/.git/refs/heads", { recursive: true });
    await fs.writeFile(`/.git/refs/heads/${ref}`, `${sha}\n`);
    if (ref === "main") {
      await fs.writeFile("/.git/HEAD", "ref: refs/heads/main\n");
    }
    return { previous };
  }

  async isAncestor(
    session: GitSession,
    ancestorSha: string,
    descendantSha: string
  ): Promise<boolean> {
    if (ancestorSha === descendantSha) {
      return true;
    }
    const fs = this.store(session.remoteUrl);
    try {
      return await isDescendent({
        fs: createGitFs(fs),
        dir: "/",
        gitdir: "/.git",
        oid: descendantSha,
        ancestor: ancestorSha,
      });
    } catch {
      return false;
    }
  }
}

class FakeRepoHandle implements ArtifactsRepoHandle {
  readonly #info: ArtifactsRepoInfo;
  #tokenSeq = 0;

  constructor(info: ArtifactsRepoInfo) {
    this.#info = info;
  }

  info(): Promise<ArtifactsRepoInfo> {
    return Promise.resolve({ ...this.#info });
  }

  createToken(
    _scope?: ArtifactsTokenScope,
    ttl = 900
  ): Promise<{ plaintext: string; expiresAt: number }> {
    this.#tokenSeq += 1;
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    return Promise.resolve({
      plaintext: `art_v2_test_${this.#info.name}_${this.#tokenSeq}?expires=${expiresAt}`,
      expiresAt,
    });
  }
}

export function createFakeArtifacts(): {
  artifacts: ArtifactsBinding;
  git: MemoryGitRemote;
  created: string[];
  tokensMinted: number;
} {
  const git = new MemoryGitRemote();
  const repos = new Map<string, FakeRepoHandle>();
  const created: string[] = [];
  let tokensMinted = 0;

  const artifacts: ArtifactsBinding = {
    create(name) {
      if (repos.has(name)) {
        return Promise.reject(new Error(`repo exists: ${name}`));
      }
      const remote = `https://artifacts.test/git/${NAMESPACE}/${name}`;
      const info: ArtifactsRepoInfo = {
        id: `repo_${name}`,
        name,
        displayName: name,
        description: "",
        defaultBranch: "main",
        remote,
        token: `art_v2_create_${name}?expires=${Math.floor(Date.now() / 1000) + 900}`,
      };
      const handle = new FakeRepoHandle(info);
      const orig = handle.createToken.bind(handle);
      handle.createToken = (scope, ttl) => {
        tokensMinted += 1;
        return orig(scope, ttl);
      };
      repos.set(name, handle);
      created.push(name);
      git.store(remote);
      return Promise.resolve({ ...info });
    },

    get(name) {
      const handle = repos.get(name);
      if (!handle) {
        return Promise.reject(new Error(`Artifacts repo not found: ${name}`));
      }
      return Promise.resolve(handle);
    },
  };

  return {
    artifacts,
    git,
    created,
    get tokensMinted() {
      return tokensMinted;
    },
  };
}
