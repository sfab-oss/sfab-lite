import type { WorkspaceFsLike } from "@cloudflare/shell";

type WorkspaceParent = {
  [K in keyof WorkspaceFsLike]: WorkspaceFsLike[K];
};

/**
 * Proxy every filesystem call to the parent AppAgent's shared Workspace.
 * Full WorkspaceFsLike so createWorkspaceStateBackend / code-mode state.*
 * see the same surface as a local Workspace.
 */
export class SharedWorkspace implements WorkspaceFsLike {
  #stubPromise?: Promise<WorkspaceParent>;
  readonly #getParent: () => Promise<WorkspaceParent>;

  constructor(getParent: () => Promise<WorkspaceParent>) {
    this.#getParent = getParent;
  }

  private parent(): Promise<WorkspaceParent> {
    this.#stubPromise ??= this.#getParent();
    return this.#stubPromise;
  }

  async readFile(path: string) {
    return (await this.parent()).readFile(path);
  }

  async readFileBytes(path: string) {
    return (await this.parent()).readFileBytes(path);
  }

  async writeFile(
    path: string,
    content: string,
    mimeType?: Parameters<import("@cloudflare/shell").Workspace["writeFile"]>[2]
  ) {
    return (await this.parent()).writeFile(path, content, mimeType);
  }

  async writeFileBytes(
    path: string,
    content: Parameters<
      import("@cloudflare/shell").Workspace["writeFileBytes"]
    >[1],
    mimeType?: Parameters<
      import("@cloudflare/shell").Workspace["writeFileBytes"]
    >[2]
  ) {
    return (await this.parent()).writeFileBytes(path, content, mimeType);
  }

  async appendFile(
    path: string,
    content: string,
    mimeType?: Parameters<
      import("@cloudflare/shell").Workspace["appendFile"]
    >[2]
  ) {
    return (await this.parent()).appendFile(path, content, mimeType);
  }

  async exists(path: string) {
    return (await this.parent()).exists(path);
  }

  async readDir(
    path?: string,
    opts?: Parameters<import("@cloudflare/shell").Workspace["readDir"]>[1]
  ) {
    return (await this.parent()).readDir(path ?? "/", opts);
  }

  async rm(
    path: string,
    opts?: Parameters<import("@cloudflare/shell").Workspace["rm"]>[1]
  ) {
    return (await this.parent()).rm(path, opts);
  }

  async glob(pattern: string) {
    return (await this.parent()).glob(pattern);
  }

  async mkdir(
    path: string,
    opts?: Parameters<import("@cloudflare/shell").Workspace["mkdir"]>[1]
  ) {
    return (await this.parent()).mkdir(path, opts);
  }

  async stat(path: string) {
    return (await this.parent()).stat(path);
  }

  async lstat(path: string) {
    return (await this.parent()).lstat(path);
  }

  async cp(
    src: string,
    dest: string,
    opts?: Parameters<import("@cloudflare/shell").Workspace["cp"]>[2]
  ) {
    return (await this.parent()).cp(src, dest, opts);
  }

  async mv(src: string, dest: string) {
    return (await this.parent()).mv(src, dest);
  }

  async symlink(target: string, linkPath: string) {
    return (await this.parent()).symlink(target, linkPath);
  }

  async readlink(path: string) {
    return (await this.parent()).readlink(path);
  }
}
