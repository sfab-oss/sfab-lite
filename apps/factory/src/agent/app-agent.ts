import { Workspace, type WorkspaceChangeEvent } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import { Think } from "@cloudflare/think";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import { callable } from "agents";
import type { LanguageModel } from "ai";
import { remoteUrlFor } from "../code-host/code-host.js";
import { createR2CodeHost } from "../code-host/r2-code-host.js";
import { getLiveSha } from "../forge/cd.js";
import { collectMigrations } from "../registry/app-migrations.js";
import {
  compileWorkspaceFiles,
  putWorkspaceBuild,
  workspaceBuildSha,
} from "../registry/workspace-build.js";
import { AppThread } from "./app-thread.js";
import { GatedWorkspace } from "./gated-workspace.js";
import {
  cloneWorkspaceFromCodeHost,
  isWorkspaceClonePending,
  isWorkspaceCloneReady,
  WORKSPACE_CLONE_PENDING,
  WORKSPACE_CLONED_KEY,
  workspaceCloneFailedMarker,
  workspaceCloneFailureReason,
} from "./seed-workspace.js";
import { createAppShellCommands } from "./shell-commands.js";
import { collectAgentWorkspaceFiles } from "./workspace-files.js";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WorkspaceBuildStatus {
  error: string | null;
  generation: number | null;
  status: "idle" | "compiling" | "ready" | "error";
}

export interface WorkspaceBranchInfo {
  branches: string[];
  current: string | null;
}

export type CheckoutBranchResult =
  | { ok: true; current: string }
  | { ok: false; error: string };

const SHELL_TIMEOUT_MS = 120_000;
const SEED_CALLBACK = "seedWorkspaceClone" as const;
const COMPILE_CALLBACK = "compileWorkspaceBuild" as const;
const WORKSPACE_COMPILE_DEBOUNCE_SEC = 1;
const WORKSPACE_BUILD_GEN_KEY = "workspaceBuildGeneration";
const WORKSPACE_BUILD_STATUS_KEY = "workspaceBuildStatus";
const WORKSPACE_BUILD_ERROR_KEY = "workspaceBuildError";
const INVALID_BRANCH_CHARS = /[\s\\]/;

export interface ThreadSummary {
  createdAt: number;
  id: string;
  title: string;
  updatedAt: number;
}

interface ThreadMetaRow {
  created_at: number;
  id: string;
  title: string;
  updated_at: number;
}

/**
 * Think root for one app-as-being-built. Owns the shared Workspace and
 * thread registry; clients talk to AppThread facets, not this DO's chat.
 * Serving traffic stays on AppDataDO — this isolate is for agent work only.
 */
export class AppAgent extends Think<Env> {
  workspace = new Workspace({
    sql: this.ctx.storage.sql,
    name: () => this.name,
    onChange: (event) => this.#broadcastWorkspaceChange(event),
  });

  /**
   * Public FS surface (MCP stub + SharedWorkspace + @callable reads).
   * Clone writes go to raw `workspace` so readiness cannot deadlock.
   */
  readonly #fs = new GatedWorkspace(
    () => this.#ensureWorkspaceReady(),
    () => this.workspace
  );

  #workspaceClonePromise: Promise<void> | null = null;
  #workspaceCompilePromise: Promise<WorkspaceBuildStatus> | null = null;

  override getModel(): LanguageModel {
    throw new Error("AppAgent chat is dormant; connect to an AppThread facet");
  }

  /**
   * Keep partyserver's `blockConcurrencyWhile(onStart)` tiny: DDL + status
   * flip + idempotent schedule. R2 clone runs outside the gate via the Agent
   * schedule alarm (and on-demand from MCP/WS callers that need the tree).
   */
  override async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS thread_meta (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`;

    const status = await this.ctx.storage.get<string>(WORKSPACE_CLONED_KEY);
    if (isWorkspaceCloneReady(status)) {
      return;
    }
    if (workspaceCloneFailureReason(status)) {
      console.warn(
        `[AppAgent] ${this.name}: workspace clone previously failed: ${workspaceCloneFailureReason(status)}`
      );
      return;
    }
    if (!status) {
      await this.ctx.storage.put(WORKSPACE_CLONED_KEY, WORKSPACE_CLONE_PENDING);
    }
    await this.schedule(0, SEED_CALLBACK, {}, { idempotent: true });
  }

  /**
   * Scheduled callback — must stay outside `onStart`. Agent alarm runs this
   * after the concurrency gate releases.
   */
  async seedWorkspaceClone(
    _payload: Record<string, never> = {}
  ): Promise<void> {
    await this.#ensureWorkspaceReady();
  }

  async #ensureWorkspaceReady(): Promise<void> {
    const status = await this.ctx.storage.get<string>(WORKSPACE_CLONED_KEY);
    if (isWorkspaceCloneReady(status)) {
      return;
    }
    // Demand path (MCP / Code / shell / SharedWorkspace): clear a prior
    // durable failure and retry. Auto onStart never reschedules on failed:.
    if (workspaceCloneFailureReason(status)) {
      await this.ctx.storage.put(WORKSPACE_CLONED_KEY, WORKSPACE_CLONE_PENDING);
    }
    if (!this.#workspaceClonePromise) {
      this.#workspaceClonePromise = this.#runWorkspaceClone().finally(() => {
        this.#workspaceClonePromise = null;
      });
    }
    await this.#workspaceClonePromise;
  }

  async #runWorkspaceClone(): Promise<void> {
    const status = await this.ctx.storage.get<string>(WORKSPACE_CLONED_KEY);
    if (isWorkspaceCloneReady(status)) {
      return;
    }
    if (!isWorkspaceClonePending(status)) {
      await this.ctx.storage.put(WORKSPACE_CLONED_KEY, WORKSPACE_CLONE_PENDING);
    }

    try {
      const { sha } = await cloneWorkspaceFromCodeHost(
        this.env,
        this.workspace,
        this.name
      );
      await this.ctx.storage.put(WORKSPACE_CLONED_KEY, sha ?? "empty");
      await this.#scheduleWorkspaceCompile();
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await this.ctx.storage.put(
        WORKSPACE_CLONED_KEY,
        workspaceCloneFailedMarker(reason)
      );
      console.error(
        `[AppAgent] ${this.name}: workspace clone failed: ${reason}`
      );
      throw e instanceof Error ? e : new Error(reason);
    }
  }

  override onBeforeSubAgent(
    _req: Request,
    { className, name }: { className: string; name: string }
  ): Promise<Request | Response | undefined> {
    if (!this.hasSubAgent(className, name)) {
      return Promise.resolve(
        new Response(`${className} "${name}" not found`, { status: 404 })
      );
    }
    return Promise.resolve(undefined);
  }

  #broadcastWorkspaceChange(event: WorkspaceChangeEvent): void {
    this.broadcast(JSON.stringify({ type: "workspace-change", event }));
    this.#scheduleWorkspaceCompile().catch(() => undefined);
  }

  async #cancelCompileSchedules(): Promise<void> {
    const pending = await this.getSchedules();
    for (const entry of pending) {
      if (entry.callback === COMPILE_CALLBACK) {
        await this.cancelSchedule(entry.id);
      }
    }
  }

  async #scheduleWorkspaceCompile(): Promise<void> {
    const status = await this.ctx.storage.get<string>(WORKSPACE_CLONED_KEY);
    if (!isWorkspaceCloneReady(status)) {
      return;
    }
    await this.#cancelCompileSchedules();
    await this.schedule(WORKSPACE_COMPILE_DEBOUNCE_SEC, COMPILE_CALLBACK, {});
  }

  /**
   * Debounced compile of WIP workspace → R2 `builds/{appId}/workspace.json`.
   * Scheduled from writes and post-clone; not full CD (no lint/check).
   */
  compileWorkspaceBuild(
    _payload: Record<string, never> = {}
  ): Promise<WorkspaceBuildStatus> {
    return this.#runWorkspaceCompile();
  }

  /**
   * Manual refresh — compiles immediately (cancels pending debounce).
   * Browser-callable so Agent Browser Reload can force a rebuild.
   */
  @callable()
  async compileWorkspaceNow(): Promise<WorkspaceBuildStatus> {
    await this.#cancelCompileSchedules();
    return this.#runWorkspaceCompile();
  }

  @callable()
  workspaceBuildStatus(): Promise<WorkspaceBuildStatus> {
    return this.#readWorkspaceBuildStatus();
  }

  async #readWorkspaceBuildStatus(): Promise<WorkspaceBuildStatus> {
    const status =
      (await this.ctx.storage.get<WorkspaceBuildStatus["status"]>(
        WORKSPACE_BUILD_STATUS_KEY
      )) ?? "idle";
    const generation =
      (await this.ctx.storage.get<number>(WORKSPACE_BUILD_GEN_KEY)) ?? null;
    const error =
      (await this.ctx.storage.get<string>(WORKSPACE_BUILD_ERROR_KEY)) ?? null;
    return { status, generation, error };
  }

  #runWorkspaceCompile(): Promise<WorkspaceBuildStatus> {
    if (this.#workspaceCompilePromise) {
      return this.#workspaceCompilePromise;
    }
    this.#workspaceCompilePromise = this.#compileWorkspaceBuildInner().finally(
      () => {
        this.#workspaceCompilePromise = null;
      }
    );
    return this.#workspaceCompilePromise;
  }

  async #compileWorkspaceBuildInner(): Promise<WorkspaceBuildStatus> {
    await this.#ensureWorkspaceReady();
    await this.ctx.storage.put(WORKSPACE_BUILD_STATUS_KEY, "compiling");
    await this.ctx.storage.delete(WORKSPACE_BUILD_ERROR_KEY);
    this.broadcast(
      JSON.stringify({ type: "workspace-build-status", status: "compiling" })
    );

    try {
      const files = await collectAgentWorkspaceFiles(this.#fs);
      const compiled = await compileWorkspaceFiles(files);
      const migrations = collectMigrations(files);
      const prev =
        (await this.ctx.storage.get<number>(WORKSPACE_BUILD_GEN_KEY)) ?? 0;
      const generation = prev + 1;
      const build = {
        ...compiled,
        sha: workspaceBuildSha(generation),
      };
      await putWorkspaceBuild(this.env, this.name, {
        generation,
        build,
        migrations,
        at: Date.now(),
      });
      await this.ctx.storage.put(WORKSPACE_BUILD_GEN_KEY, generation);
      await this.ctx.storage.put(WORKSPACE_BUILD_STATUS_KEY, "ready");
      const result: WorkspaceBuildStatus = {
        status: "ready",
        generation,
        error: null,
      };
      this.broadcast(
        JSON.stringify({
          type: "workspace-build-ready",
          generation,
        })
      );
      return result;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await this.ctx.storage.put(WORKSPACE_BUILD_STATUS_KEY, "error");
      await this.ctx.storage.put(WORKSPACE_BUILD_ERROR_KEY, reason);
      this.broadcast(
        JSON.stringify({
          type: "workspace-build-status",
          status: "error",
          error: reason,
        })
      );
      console.error(
        `[AppAgent] ${this.name}: workspace compile failed: ${reason}`
      );
      return { status: "error", generation: null, error: reason };
    }
  }

  @callable()
  listThreads(): ThreadSummary[] {
    const registry = this.listSubAgents("AppThread");
    const metaRows = this.sql<ThreadMetaRow>`
      SELECT id, title, created_at, updated_at FROM thread_meta`;
    const metaById = new Map(metaRows.map((row) => [row.id, row]));

    // thread_meta is the product existence key. A registry row without meta
    // (e.g. deleteSubAgent left a sticky facet entry) must not resurface as a
    // conversation with a synthetic default title.
    return registry
      .flatMap((entry) => {
        const meta = metaById.get(entry.name);
        if (!meta) {
          return [];
        }
        return [
          {
            id: entry.name,
            title: meta.title,
            createdAt: meta.created_at,
            updatedAt: meta.updated_at,
          },
        ];
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  @callable()
  async createThread(opts?: { title?: string }): Promise<ThreadSummary> {
    const id = generateThreadId();
    const now = Date.now();
    const title = opts?.title?.trim() || defaultThreadTitle(now);

    await this.subAgent(AppThread, id);
    this.sql`INSERT INTO thread_meta (id, title, created_at, updated_at)
      VALUES (${id}, ${title}, ${now}, ${now})`;

    return { id, title, createdAt: now, updatedAt: now };
  }

  @callable()
  renameThread(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      return Promise.resolve();
    }
    // UPDATE, not upsert: meta is the existence key, so inserting here would
    // let a rename recreate a thread that was deleted — including one whose
    // registry row came back via the WS re-resolve path.
    this.sql`UPDATE thread_meta
      SET title = ${trimmed}, updated_at = ${Date.now()}
      WHERE id = ${id}`;
    return Promise.resolve();
  }

  @callable()
  async deleteThread(id: string): Promise<void> {
    await this.deleteSubAgent(AppThread, id);
    this.sql`DELETE FROM thread_meta WHERE id = ${id}`;
  }

  liveSha(): Promise<string | null> {
    return getLiveSha(this.env, this.name);
  }

  remoteUrl(): string {
    return remoteUrlFor(this.name);
  }

  /**
   * Run a shell script against this app's workspace — the same bash tool, the
   * same `createAppShellCommands`, that a model turn drives.
   *
   * Deliberately **not** `@callable()`. That decorator is what publishes a
   * method on `/agents/app-agent/<appId>`, which any org member with app
   * access can reach from the browser; this is for server-side callers holding
   * the stub (the MCP surface, gated on `ADMIN_TOKEN`). `AppThread.harnessBash`
   * is the same capability behind an `AGENT_HARNESS` flag, for the same reason.
   */
  async runShell(script: string): Promise<ShellResult> {
    await this.#ensureWorkspaceReady();
    const { bash } = createWorkspaceTools(this.#fs, {
      bash: {
        timeout: SHELL_TIMEOUT_MS,
        customCommands: createAppShellCommands({
          env: this.env,
          appId: this.name,
        }),
      },
    });
    if (!bash?.execute) {
      throw new Error("bash tool unavailable");
    }
    const raw = await bash.execute(
      { script },
      { toolCallId: "mcp", messages: [] }
    );
    if (!raw || typeof raw !== "object" || Symbol.asyncIterator in raw) {
      throw new Error("bash tool returned a stream; expected a single result");
    }
    const { stdout, stderr, exitCode } = raw as ShellResult;
    return { stdout, stderr, exitCode };
  }

  /**
   * Browser-callable read of the agent workspace (WIP). Same substrate as MCP
   * `workspace_read`. Writes stay stub-only — not published on the WS surface.
   */
  @callable()
  readFile(path: string) {
    return this.#fs.readFile(path);
  }

  readFileBytes(path: string) {
    return this.#fs.readFileBytes(path);
  }

  writeFile(
    path: string,
    content: string,
    mimeType?: Parameters<Workspace["writeFile"]>[2]
  ) {
    return this.#fs.writeFile(path, content, mimeType);
  }

  writeFileBytes(
    path: string,
    content: Parameters<Workspace["writeFileBytes"]>[1],
    mimeType?: Parameters<Workspace["writeFileBytes"]>[2]
  ) {
    return this.#fs.writeFileBytes(path, content, mimeType);
  }

  appendFile(
    path: string,
    content: string,
    mimeType?: Parameters<Workspace["appendFile"]>[2]
  ) {
    return this.#fs.appendFile(path, content, mimeType);
  }

  exists(path: string) {
    return this.#fs.exists(path);
  }

  /** Browser-callable directory listing — MCP `workspace_ls` counterpart. */
  @callable()
  readDir(path: string, opts?: Parameters<Workspace["readDir"]>[1]) {
    return this.#fs.readDir(path, opts);
  }

  @callable()
  async workspaceBranch(): Promise<WorkspaceBranchInfo> {
    await this.#ensureWorkspaceReady();
    const git = this.#workspaceGit();
    const listed = await git.branch({ list: true });
    const local =
      "branches" in listed && Array.isArray(listed.branches)
        ? listed.branches
        : [];
    const current =
      "current" in listed && typeof listed.current === "string"
        ? listed.current
        : null;
    const remote = await createR2CodeHost(this.env).listBranches(this.name);
    const branches = [...new Set([...local, ...remote])].sort((a, b) =>
      a.localeCompare(b)
    );
    return { current, branches };
  }

  @callable()
  async checkoutBranch(name: string): Promise<CheckoutBranchResult> {
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, error: "Branch name required" };
    }
    if (trimmed.includes("..") || INVALID_BRANCH_CHARS.test(trimmed)) {
      return { ok: false, error: "Invalid branch name" };
    }
    await this.#ensureWorkspaceReady();
    try {
      const git = this.#workspaceGit();
      await git.checkout({ ref: trimmed });
      this.broadcast(
        JSON.stringify({
          type: "workspace-change",
          event: { type: "checkout", branch: trimmed },
        })
      );
      await this.#scheduleWorkspaceCompile();
      return { ok: true, current: trimmed };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message || "Checkout failed" };
    }
  }

  #workspaceGit() {
    return createGit(
      this.workspace as unknown as Parameters<typeof createGit>[0],
      "/"
    );
  }

  rm(path: string, opts?: Parameters<Workspace["rm"]>[1]) {
    return this.#fs.rm(path, opts);
  }

  glob(pattern: string) {
    return this.#fs.glob(pattern);
  }

  mkdir(path: string, opts?: Parameters<Workspace["mkdir"]>[1]) {
    return this.#fs.mkdir(path, opts);
  }

  stat(path: string) {
    return this.#fs.stat(path);
  }

  lstat(path: string) {
    return this.#fs.lstat(path);
  }

  cp(src: string, dest: string, opts?: Parameters<Workspace["cp"]>[2]) {
    return this.#fs.cp(src, dest, opts);
  }

  mv(src: string, dest: string) {
    return this.#fs.mv(src, dest);
  }

  symlink(target: string, linkPath: string) {
    return this.#fs.symlink(target, linkPath);
  }

  readlink(path: string) {
    return this.#fs.readlink(path);
  }
}

function generateThreadId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `thr_${hex}`;
}

function defaultThreadTitle(timestamp: number): string {
  return `Thread ${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")}`;
}
