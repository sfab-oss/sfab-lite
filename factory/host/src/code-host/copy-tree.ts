import type { GitWorkFs } from "./code-host.js";
import { errorCode } from "./fs-error.ts";

const COPY_CONCURRENCY = 16;

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const n = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) {
        return;
      }
      results[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

function isEnoent(err: unknown): boolean {
  if (errorCode(err) === "ENOENT") {
    return true;
  }
  return err instanceof Error && err.message.startsWith("ENOENT");
}

interface CopyFile {
  fromPath: string;
  toPath: string;
}

async function lstatOrMissing(
  fs: GitWorkFs,
  path: string
): Promise<{
  type: "file" | "directory" | "symlink";
  size: number;
  mtime: Date;
  mode?: number;
} | null> {
  try {
    return await fs.lstat(path);
  } catch (err) {
    if (isEnoent(err)) {
      return null;
    }
    throw err;
  }
}

async function collectCopyPlan(
  from: GitWorkFs,
  fromDir: string,
  toDir: string,
  files: CopyFile[],
  emptyDirs: string[]
): Promise<void> {
  const st = await lstatOrMissing(from, fromDir);
  if (!st) {
    return;
  }
  if (st.type === "file") {
    files.push({ fromPath: fromDir, toPath: toDir });
    return;
  }
  const names = (await from.readdir(fromDir)).filter(
    (name) => name !== "." && name !== ".."
  );
  if (names.length === 0) {
    emptyDirs.push(toDir);
    return;
  }
  for (const name of names) {
    await collectCopyPlan(
      from,
      joinPath(fromDir, name),
      joinPath(toDir, name),
      files,
      emptyDirs
    );
  }
}

async function collectViaPrefixList(
  from: GitWorkFs,
  fromDir: string,
  toDir: string,
  files: CopyFile[]
): Promise<void> {
  const rels = await from.listFilesUnder?.(fromDir);
  if (!rels) {
    return;
  }
  for (const rel of rels) {
    files.push({
      fromPath: joinPath(fromDir, rel),
      toPath: joinPath(toDir, rel),
    });
  }
}

export async function copyTree(
  from: GitWorkFs,
  fromDir: string,
  to: GitWorkFs,
  toDir: string
): Promise<void> {
  const st = await lstatOrMissing(from, fromDir);
  if (!st) {
    return;
  }
  if (st.type === "file") {
    await to.writeFileBytes(toDir, await from.readFileBytes(fromDir));
    return;
  }
  const files: CopyFile[] = [];
  const emptyDirs: string[] = [];
  if (from.listFilesUnder) {
    await collectViaPrefixList(from, fromDir, toDir, files);
  } else {
    const names = (await from.readdir(fromDir)).filter(
      (name) => name !== "." && name !== ".."
    );
    if (names.length === 0) {
      emptyDirs.push(toDir);
    } else {
      for (const name of names) {
        await collectCopyPlan(
          from,
          joinPath(fromDir, name),
          joinPath(toDir, name),
          files,
          emptyDirs
        );
      }
    }
  }
  await mapLimit(files, COPY_CONCURRENCY, async (file) => {
    await to.writeFileBytes(
      file.toPath,
      await from.readFileBytes(file.fromPath)
    );
  });
  await mapLimit(emptyDirs, COPY_CONCURRENCY, async (dir) => {
    await to.mkdir(dir, { recursive: true });
  });
}
