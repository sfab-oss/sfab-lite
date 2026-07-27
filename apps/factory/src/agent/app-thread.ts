import {
  createWorkspaceStateBackend,
  STATE_SYSTEM_PROMPT,
  STATE_TYPES,
  Workspace,
  type WorkspaceFsLike,
} from "@cloudflare/shell";
import { Think } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import { callable } from "agents";
import type { LanguageModel, ToolSet } from "ai";
import { createZaiCodingModel, requireZaiApiKey } from "./model.js";
import { parseThreadName, seedWorkspaceFromLive } from "./seed-workspace.js";
import { createAppShellCommands } from "./shell-commands.js";

/**
 * One Think Durable Object per chat thread. Workspace is a scratch checkout
 * of the app's live `source_files` — not a second source of truth until a
 * shell `pnpm run deploy` / `wrangler deploy` publishes it.
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

    // Parent ctor sets workspaceBash=true; replace after construct so Think's
    // createWorkspaceTools picks up customCommands. Stock createBashTool
    // omitted that field from `new Bash(...)` — forwarded by
    // patches/@cloudflare__think@0.13.0.patch.
    this.workspaceBash = {
      timeout: 120_000,
      customCommands: createAppShellCommands({
        env: this.env,
        appId,
      }),
    };
  }

  /** Harness-only: exercise bash customCommands without a model turn. */
  @callable()
  async harnessBash(script: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    if (this.env.AGENT_HARNESS !== "true") {
      throw new Error("harnessBash is harness-only");
    }
    const { bash } = createWorkspaceTools(this.workspace, {
      bash: this.workspaceBash,
    });
    if (!bash?.execute) {
      throw new Error("bash tool unavailable");
    }
    const raw = await bash.execute(
      { script },
      {
        toolCallId: "harness",
        messages: [],
      }
    );
    if (!raw || typeof raw !== "object" || Symbol.asyncIterator in raw) {
      throw new Error("bash tool returned a stream; expected a single result");
    }
    const result = raw as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
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
      "pnpm add / install refuse — the import map is frozen.",
      "Branch on real exit codes the way you would in any shell.",
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
