import {
  createWorkspaceStateBackend,
  STATE_SYSTEM_PROMPT,
  STATE_TYPES,
  Workspace,
  type WorkspaceFsLike,
} from "@cloudflare/shell";
import { Think } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import type { BashOperations } from "@cloudflare/think/tools/workspace";
import { callable } from "agents";
import type { LanguageModel, ToolSet } from "ai";
import { createZaiCodingModel, requireZaiApiKey } from "./model.js";
import { parseThreadName, seedWorkspaceFromLive } from "./seed-workspace.js";
import { createAppShellCommands } from "./shell-commands.js";
import { createBashTool } from "./vendor/bash-tool.js";

/**
 * One Think Durable Object per chat thread. Workspace is a scratch checkout
 * of the app's live `source_files` — not a second source of truth until a
 * shell `pnpm run deploy` / `wrangler deploy` publishes it.
 */
export class AppThread extends Think<Env> {
  override maxSteps = 40;

  /**
   * Stock Think bash cannot take `customCommands` (createBashTool has no
   * pass-through). Disable it and register the vendored tool instead.
   */
  override workspaceBash = false as const;

  /**
   * Full filesystem surface for code mode's `state.*`. Think's default
   * `WorkspaceLike` is narrower than `createWorkspaceStateBackend` needs.
   */
  override workspace: WorkspaceFsLike = new Workspace({
    sql: this.ctx.storage.sql,
    name: () => this.name,
  });

  #appId: string | null = null;
  #liveVersionId: string | null = null;
  #model: LanguageModel | null = null;

  override async onStart(): Promise<void> {
    const { appId } = parseThreadName(this.name);
    this.#appId = appId;

    const seeded = await seedWorkspaceFromLive(
      this.env,
      this.ctx.storage,
      this.workspace,
      appId
    );
    this.#liveVersionId = seeded.liveVersionId;

    // Model is resolved lazily in getModel — missing ZAI_API_KEY must not
    // block workspace seeding / WS connect; it fails on the first turn.
    const key = this.env.ZAI_API_KEY?.trim();
    if (key) {
      this.#model = createZaiCodingModel(key);
    }
  }

  /** Local harness only — set `AGENT_HARNESS=true` in `.dev.vars`. */
  @callable()
  async inspectWorkspace(): Promise<{
    appId: string;
    liveVersionId: string | null;
    paths: string[];
  }> {
    if (this.env.AGENT_HARNESS !== "true") {
      throw new Error("inspectWorkspace is harness-only");
    }
    const appId = this.#appId ?? parseThreadName(this.name).appId;
    const files = await this.workspace.glob("**/*");
    const paths = files.map((f) => f.path).sort((a, b) => a.localeCompare(b));
    return {
      appId,
      liveVersionId: this.#liveVersionId,
      paths,
    };
  }

  override getModel(): LanguageModel {
    if (!this.#model) {
      this.#model = createZaiCodingModel(requireZaiApiKey(this.env));
    }
    return this.#model;
  }

  override getSystemPrompt(): string {
    const appId = this.#appId ?? parseThreadName(this.name).appId;
    const live = this.#liveVersionId ?? "unknown";
    return [
      `You are a coding agent for sfab-lite factory app ${appId}.`,
      `Your workspace is a scratch checkout of live version ${live}.`,
      "Use the file tools (list, find, grep, read, write, edit, …) and the bash tool for shell-style workflows.",
      "Check and publish are ordinary shell commands in bash:",
      "  pnpm typecheck          — typecheck via the check worker (tsc-style output)",
      "  pnpm lint               — lint via the lint worker",
      "  pnpm lint --fix         — lint and write formatting fixes back to the workspace",
      "  pnpm run deploy         — publish (also: wrangler deploy)",
      "pnpm add / install / dev / test refuse — the import map is frozen.",
      "Branch on real exit codes the way you would in any shell.",
      "Answer from the workspace contents; do not guess from the app id alone.",
      "",
      STATE_SYSTEM_PROMPT.replace("{{types}}", STATE_TYPES),
    ].join("\n");
  }

  override getTools(): ToolSet {
    const appId = this.#appId ?? parseThreadName(this.name).appId;
    const ops = workspaceBashOps(this.workspace);
    return {
      execute: createExecuteTool({
        ctx: this.ctx,
        state: createWorkspaceStateBackend(this.workspace),
        loader: this.env.LOADER,
      }),
      bash: createBashTool({
        ops,
        // Commit can take 10–24s beside typecheck; keep headroom under DO limits.
        timeout: 120_000,
        customCommands: createAppShellCommands({
          env: this.env,
          appId,
        }),
      }),
    };
  }
}

function workspaceBashOps(ws: WorkspaceFsLike): BashOperations {
  const maybeBytesWriter = ws as WorkspaceFsLike & {
    writeFileBytes?: (path: string, content: Uint8Array) => Promise<void>;
  };
  return {
    readDir: (dir, opts) => ws.readDir(dir, opts),
    readFileBytes: (path) => ws.readFileBytes(path),
    writeFile: (path, content) => ws.writeFile(path, content),
    writeFileBytes: maybeBytesWriter.writeFileBytes
      ? (path, content) => {
          const write = maybeBytesWriter.writeFileBytes;
          if (!write) {
            return Promise.resolve();
          }
          return write(path, content);
        }
      : undefined,
    mkdir: (path, opts) => ws.mkdir(path, opts),
    rm: (path, opts) => ws.rm(path, opts),
  };
}
