import type { WorkspaceFsLike } from "@cloudflare/shell";
import { assertWritableWorkspacePath } from "./platform-readonly.js";

/**
 * Every FS op awaits `ensureReady` before hitting the underlying workspace.
 * Keeps AppAgent / SharedWorkspace / MCP / tools on one readiness contract.
 * Mutating ops apply factory write policy (`platform-readonly.ts`).
 */
export class GatedWorkspace implements WorkspaceFsLike {
  readonly #ensureReady: () => Promise<void>;
  readonly #inner: () => WorkspaceFsLike;

  constructor(ensureReady: () => Promise<void>, inner: () => WorkspaceFsLike) {
    this.#ensureReady = ensureReady;
    this.#inner = inner;
  }

  async #fs(): Promise<WorkspaceFsLike> {
    await this.#ensureReady();
    return this.#inner();
  }

  async readFile(path: string) {
    return (await this.#fs()).readFile(path);
  }

  async readFileBytes(path: string) {
    return (await this.#fs()).readFileBytes(path);
  }

  async writeFile(
    path: string,
    content: string,
    mimeType?: Parameters<WorkspaceFsLike["writeFile"]>[2]
  ) {
    assertWritableWorkspacePath(path);
    return (await this.#fs()).writeFile(path, content, mimeType);
  }

  async writeFileBytes(
    path: string,
    content: Parameters<WorkspaceFsLike["writeFileBytes"]>[1],
    mimeType?: Parameters<WorkspaceFsLike["writeFileBytes"]>[2]
  ) {
    assertWritableWorkspacePath(path);
    return (await this.#fs()).writeFileBytes(path, content, mimeType);
  }

  async appendFile(
    path: string,
    content: string,
    mimeType?: Parameters<WorkspaceFsLike["appendFile"]>[2]
  ) {
    assertWritableWorkspacePath(path);
    return (await this.#fs()).appendFile(path, content, mimeType);
  }

  async exists(path: string) {
    return (await this.#fs()).exists(path);
  }

  async readDir(
    path?: string,
    opts?: Parameters<WorkspaceFsLike["readDir"]>[1]
  ) {
    return (await this.#fs()).readDir(path ?? "/", opts);
  }

  async rm(path: string, opts?: Parameters<WorkspaceFsLike["rm"]>[1]) {
    assertWritableWorkspacePath(path);
    return (await this.#fs()).rm(path, opts);
  }

  async glob(pattern: string) {
    return (await this.#fs()).glob(pattern);
  }

  async mkdir(path: string, opts?: Parameters<WorkspaceFsLike["mkdir"]>[1]) {
    return (await this.#fs()).mkdir(path, opts);
  }

  async stat(path: string) {
    return (await this.#fs()).stat(path);
  }

  async lstat(path: string) {
    return (await this.#fs()).lstat(path);
  }

  async cp(
    src: string,
    dest: string,
    opts?: Parameters<WorkspaceFsLike["cp"]>[2]
  ) {
    assertWritableWorkspacePath(dest);
    return (await this.#fs()).cp(src, dest, opts);
  }

  async mv(src: string, dest: string) {
    assertWritableWorkspacePath(src);
    assertWritableWorkspacePath(dest);
    return (await this.#fs()).mv(src, dest);
  }

  async symlink(target: string, linkPath: string) {
    assertWritableWorkspacePath(linkPath);
    return (await this.#fs()).symlink(target, linkPath);
  }

  async readlink(path: string) {
    return (await this.#fs()).readlink(path);
  }
}
