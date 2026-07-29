import { Workspace, type WorkspaceChangeEvent } from "@cloudflare/shell";
import { Think } from "@cloudflare/think";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import { callable } from "agents";
import type { LanguageModel } from "ai";
import { appStub } from "../commit.js";
import { AppThread } from "./app-thread.js";
import { seedWorkspaceFromLive } from "./seed-workspace.js";
import { createAppShellCommands } from "./shell-commands.js";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const SHELL_TIMEOUT_MS = 120_000;

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
 * Serving traffic stays on AppDO — this isolate is for agent work only.
 */
export class AppAgent extends Think<Env> {
  workspace = new Workspace({
    sql: this.ctx.storage.sql,
    name: () => this.name,
    onChange: (event) => this.#broadcastWorkspaceChange(event),
  });

  override getModel(): LanguageModel {
    throw new Error("AppAgent chat is dormant; connect to an AppThread facet");
  }

  override async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS thread_meta (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`;

    const seeded = await seedWorkspaceFromLive(
      this.env,
      this.ctx.storage,
      this.workspace,
      this.name
    );
    if ("skipped" in seeded) {
      console.warn(`[AppAgent] ${this.name}: ${seeded.reason}`);
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

  async liveVersionId(): Promise<string | null> {
    const live = await appStub(this.env, this.name).getLive();
    return live.liveVersionId ?? null;
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
    const { bash } = createWorkspaceTools(this.workspace, {
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
    return this.workspace.readFile(path);
  }

  readFileBytes(path: string) {
    return this.workspace.readFileBytes(path);
  }

  writeFile(
    path: string,
    content: string,
    mimeType?: Parameters<Workspace["writeFile"]>[2]
  ) {
    return this.workspace.writeFile(path, content, mimeType);
  }

  writeFileBytes(
    path: string,
    content: Parameters<Workspace["writeFileBytes"]>[1],
    mimeType?: Parameters<Workspace["writeFileBytes"]>[2]
  ) {
    return this.workspace.writeFileBytes(path, content, mimeType);
  }

  appendFile(
    path: string,
    content: string,
    mimeType?: Parameters<Workspace["appendFile"]>[2]
  ) {
    return this.workspace.appendFile(path, content, mimeType);
  }

  exists(path: string) {
    return this.workspace.exists(path);
  }

  /** Browser-callable directory listing — MCP `workspace_ls` counterpart. */
  @callable()
  readDir(path: string, opts?: Parameters<Workspace["readDir"]>[1]) {
    return this.workspace.readDir(path, opts);
  }

  rm(path: string, opts?: Parameters<Workspace["rm"]>[1]) {
    return this.workspace.rm(path, opts);
  }

  glob(pattern: string) {
    return this.workspace.glob(pattern);
  }

  mkdir(path: string, opts?: Parameters<Workspace["mkdir"]>[1]) {
    return this.workspace.mkdir(path, opts);
  }

  stat(path: string) {
    return this.workspace.stat(path);
  }

  lstat(path: string) {
    return this.workspace.lstat(path);
  }

  cp(src: string, dest: string, opts?: Parameters<Workspace["cp"]>[2]) {
    return this.workspace.cp(src, dest, opts);
  }

  mv(src: string, dest: string) {
    return this.workspace.mv(src, dest);
  }

  symlink(target: string, linkPath: string) {
    return this.workspace.symlink(target, linkPath);
  }

  readlink(path: string) {
    return this.workspace.readlink(path);
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
