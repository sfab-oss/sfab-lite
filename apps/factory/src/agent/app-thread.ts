import {
  createWorkspaceStateBackend,
  STATE_SYSTEM_PROMPT,
  STATE_TYPES,
  Workspace,
  type WorkspaceFsLike,
} from "@cloudflare/shell";
import { Think } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { callable } from "agents";
import type { LanguageModel, ToolSet } from "ai";
import { createZaiCodingModel, requireZaiApiKey } from "./model.js";
import { parseThreadName, seedWorkspaceFromLive } from "./seed-workspace.js";

/**
 * One Think Durable Object per chat thread. Workspace is a scratch checkout
 * of the app's live `source_files` — not a second source of truth, and never
 * written back to `_sfab_versions` / `_sfab_live` in this cut (S4.2).
 */
export class AppThread extends Think<Env> {
  override maxSteps = 40;

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
      "Use the file tools (list, find, grep, read, …) and the execute tool's state.* API to inspect the source.",
      "There is no publish or check tool in this session — do not invent one.",
      "Answer from the workspace contents; do not guess from the app id alone.",
      "",
      STATE_SYSTEM_PROMPT.replace("{{types}}", STATE_TYPES),
    ].join("\n");
  }

  override getTools(): ToolSet {
    return {
      execute: createExecuteTool({
        ctx: this.ctx,
        state: createWorkspaceStateBackend(this.workspace),
        loader: this.env.LOADER,
      }),
    };
  }
}
