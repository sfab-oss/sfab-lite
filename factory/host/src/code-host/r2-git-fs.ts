import { posix } from "node:path";
import type { GitWorkFs } from "./code-host.js";
import { fsError } from "./fs-error.ts";
import type { ObjectStore } from "./object-store.ts";

const LEADING_SLASHES = /^\/+/;
const TRAILING_SLASHES = /\/*$/;

function normalize(path: string): string {
  const n = posix.normalize(`/${path}`);
  return n === "/" ? "/" : n.replace(TRAILING_SLASHES, "");
}

function parentOf(path: string): string {
  const n = normalize(path);
  const i = n.lastIndexOf("/");
  return i <= 0 ? "/" : n.slice(0, i);
}

function join(base: string, name: string): string {
  if (base === "/") {
    return `/${name}`;
  }
  return `${base}/${name}`;
}

/**
 * File-per-path R2 filesystem under a key prefix. Used as the bare-repo
 * store for the code-host stand-in (`repos/{appId}/…`).
 */
export class R2GitFs implements GitWorkFs {
  readonly #bucket: ObjectStore;
  readonly #prefix: string;

  constructor(bucket: ObjectStore, prefix: string) {
    this.#bucket = bucket;
    this.#prefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  }

  #objectKey(path: string): string {
    const n = normalize(path).replace(LEADING_SLASHES, "");
    return `${this.#prefix}${n}`;
  }

  #childPrefix(path: string): string {
    if (path === "/") {
      return this.#prefix;
    }
    return `${this.#objectKey(path).replace(TRAILING_SLASHES, "")}/`;
  }

  resolvePath(base: string, path: string): string {
    if (path.startsWith("/")) {
      return normalize(path);
    }
    return normalize(`${base}/${path}`);
  }

  async exists(path: string): Promise<boolean> {
    const n = normalize(path);
    if (n === "/") {
      return true;
    }
    if ((await this.#bucket.head(this.#objectKey(n))) != null) {
      return true;
    }
    return await this.#hasChildren(n);
  }

  async #hasChildren(path: string): Promise<boolean> {
    const listed = await this.#bucket.list({
      prefix: this.#childPrefix(path),
      limit: 1,
    });
    return listed.objects.length > 0;
  }

  async listFilesUnder(dir: string): Promise<string[]> {
    const prefix = this.#childPrefix(normalize(dir));
    const files: string[] = [];
    let cursor: string | undefined;
    do {
      const listed = await this.#bucket.list({
        prefix,
        cursor,
        limit: 1000,
      });
      for (const obj of listed.objects) {
        const rest = obj.key.slice(prefix.length);
        if (!rest || rest === ".gitkeep" || rest.endsWith("/.gitkeep")) {
          continue;
        }
        files.push(rest);
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    return files;
  }

  async readFile(path: string): Promise<string> {
    const bytes = await this.readFileBytes(path);
    return new TextDecoder().decode(bytes);
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    const obj = await this.#bucket.get(this.#objectKey(path));
    if (!obj) {
      throw fsError(path, "ENOENT");
    }
    return new Uint8Array(await obj.arrayBuffer());
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.writeFileBytes(path, new TextEncoder().encode(content));
  }

  async writeFileBytes(path: string, content: Uint8Array): Promise<void> {
    await this.#bucket.put(this.#objectKey(path), content);
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<void> {
    const existing = (await this.exists(path))
      ? await this.readFileBytes(path)
      : new Uint8Array();
    const add =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    const merged = new Uint8Array(existing.length + add.length);
    merged.set(existing);
    merged.set(add, existing.length);
    await this.writeFileBytes(path, merged);
  }

  stat(path: string): Promise<{
    type: "file" | "directory" | "symlink";
    size: number;
    mtime: Date;
    mode?: number;
  }> {
    return this.lstat(path);
  }

  async lstat(path: string): Promise<{
    type: "file" | "directory" | "symlink";
    size: number;
    mtime: Date;
    mode?: number;
  }> {
    const n = normalize(path);
    if (n === "/") {
      return { type: "directory", size: 0, mtime: new Date(0), mode: 0o4_0755 };
    }
    const obj = await this.#bucket.head(this.#objectKey(n));
    if (obj) {
      return {
        type: "file",
        size: obj.size,
        mtime: obj.uploaded,
        mode: 0o10_0644,
      };
    }
    if (await this.#hasChildren(n)) {
      return { type: "directory", size: 0, mtime: new Date(0), mode: 0o4_0755 };
    }
    throw fsError(path, "ENOENT");
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const n = normalize(path);
    if (n === "/") {
      return;
    }
    if (await this.exists(n)) {
      const s = await this.lstat(n);
      if (s.type === "directory") {
        return;
      }
      throw new Error(`ENOTDIR: ${path}`);
    }
    const parent = parentOf(n);
    if (!options?.recursive) {
      if (parent !== "/" && !(await this.exists(parent))) {
        throw fsError(parent, "ENOENT");
      }
    } else if (parent !== "/") {
      await this.mkdir(parent, { recursive: true });
    }
    await this.#bucket.put(this.#objectKey(`${n}/.gitkeep`), new Uint8Array());
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirWithFileTypes(path);
    return entries.map((e) => e.name);
  }

  async readdirWithFileTypes(
    path: string
  ): Promise<{ name: string; type: "file" | "directory" | "symlink" }[]> {
    const names = await this.#listChildNames(normalize(path));
    return [...names.entries()]
      .map(([name, type]) => ({ name, type }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async #listChildNames(
    path: string
  ): Promise<Map<string, "file" | "directory">> {
    const prefix = this.#childPrefix(path);
    const names = new Map<string, "file" | "directory">();
    let cursor: string | undefined;
    do {
      const listed = await this.#bucket.list({
        prefix,
        cursor,
        limit: 1000,
      });
      for (const obj of listed.objects) {
        this.#ingestListKey(names, obj.key.slice(prefix.length));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    return names;
  }

  #ingestListKey(names: Map<string, "file" | "directory">, rest: string): void {
    if (!rest || rest === ".gitkeep") {
      return;
    }
    const slash = rest.indexOf("/");
    if (slash === -1) {
      names.set(rest, "file");
      return;
    }
    const dir = rest.slice(0, slash);
    if (dir) {
      names.set(dir, "directory");
    }
  }

  async rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    const n = normalize(path);
    if (n === "/") {
      throw new Error("cannot remove root");
    }
    const obj = await this.#bucket.head(this.#objectKey(n));
    if (obj) {
      await this.#bucket.delete(this.#objectKey(n));
      return;
    }
    if (!(await this.#hasChildren(n))) {
      if (options?.force) {
        return;
      }
      throw fsError(path, "ENOENT");
    }
    if (!options?.recursive) {
      throw new Error(`ENOTEMPTY: ${path}`);
    }
    await this.#deletePrefix(this.#childPrefix(n));
  }

  async #deletePrefix(prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const listed = await this.#bucket.list({ prefix, cursor, limit: 1000 });
      if (listed.objects.length > 0) {
        await this.#bucket.delete(listed.objects.map((o) => o.key));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  async cp(
    src: string,
    dest: string,
    options?: { recursive?: boolean }
  ): Promise<void> {
    const s = await this.lstat(src);
    if (s.type === "file") {
      await this.writeFileBytes(dest, await this.readFileBytes(src));
      return;
    }
    if (!options?.recursive) {
      throw new Error(`EISDIR: ${src}`);
    }
    await this.mkdir(dest, { recursive: true });
    for (const name of await this.readdir(src)) {
      await this.cp(join(normalize(src), name), join(normalize(dest), name), {
        recursive: true,
      });
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.cp(src, dest, { recursive: true });
    await this.rm(src, { recursive: true, force: true });
  }

  symlink(_target: string, _linkPath: string): Promise<void> {
    return Promise.reject(new Error("symlink not supported on R2GitFs"));
  }

  readlink(_path: string): Promise<string> {
    return Promise.reject(new Error("readlink not supported on R2GitFs"));
  }

  realpath(path: string): Promise<string> {
    return Promise.resolve(normalize(path));
  }

  glob(_pattern: string): Promise<string[]> {
    return Promise.resolve([]);
  }
}
