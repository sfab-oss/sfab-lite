import type { IFileSystem } from "just-bash";
import type { GitWorkFs } from "./code-host.js";

function entryType(
  isSymbolicLink: boolean,
  isDirectory: boolean
): "file" | "directory" | "symlink" {
  if (isSymbolicLink) {
    return "symlink";
  }
  if (isDirectory) {
    return "directory";
  }
  return "file";
}

/**
 * Bridge just-bash `ctx.fs` to the FileSystem shape `createGit` expects.
 * just-bash stats use `isFile`/`isDirectory`; shell FileSystem uses `type`.
 */
export function bridgeBashFs(fs: IFileSystem): GitWorkFs {
  return {
    readFile: (path) => fs.readFile(path),
    readFileBytes: async (path) => {
      const data = await fs.readFileBuffer(path);
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    },
    writeFile: (path, content) => fs.writeFile(path, content),
    writeFileBytes: (path, content) => fs.writeFile(path, content),
    appendFile: (path, content) => fs.appendFile(path, content),
    exists: (path) => fs.exists(path),
    async stat(path) {
      const s = await fs.stat(path);
      return {
        type: entryType(s.isSymbolicLink, s.isDirectory),
        size: s.size,
        mtime: s.mtime,
        mode: s.mode,
      };
    },
    async lstat(path) {
      const s = await fs.lstat(path);
      return {
        type: entryType(s.isSymbolicLink, s.isDirectory),
        size: s.size,
        mtime: s.mtime,
        mode: s.mode,
      };
    },
    mkdir: (path, options) => fs.mkdir(path, options),
    readdir: (path) => fs.readdir(path),
    async readdirWithFileTypes(path) {
      if (fs.readdirWithFileTypes) {
        const entries = await fs.readdirWithFileTypes(path);
        return entries.map((e) => ({
          name: e.name,
          type: entryType(e.isSymbolicLink, e.isDirectory),
        }));
      }
      const names = await fs.readdir(path);
      const out: {
        name: string;
        type: "file" | "directory" | "symlink";
      }[] = [];
      for (const name of names) {
        const child = fs.resolvePath(path, name);
        const s = await fs.lstat(child);
        out.push({
          name,
          type: entryType(s.isSymbolicLink, s.isDirectory),
        });
      }
      return out;
    },
    rm: (path, options) => fs.rm(path, options),
    cp: (src, dest, options) => fs.cp(src, dest, options),
    mv: (src, dest) => fs.mv(src, dest),
    symlink: (target, linkPath) => fs.symlink(target, linkPath),
    readlink: (path) => fs.readlink(path),
    realpath: (path) => fs.realpath(path),
    resolvePath: (base, path) => fs.resolvePath(base, path),
    glob: (_pattern) => Promise.resolve([]),
  };
}
