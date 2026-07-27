import {
  createWorkspaceStateBackend,
  STATE_SYSTEM_PROMPT,
  STATE_TYPES,
  type WorkspaceFsLike,
} from "@cloudflare/shell";
import { Think } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import { callable } from "agents";
import type { LanguageModel, ToolSet } from "ai";
import { AppAgent } from "./app-agent.js";
import { createZaiCodingModel, requireZaiApiKey } from "./model.js";
import { SharedWorkspace } from "./shared-workspace.js";
import { createAppShellCommands } from "./shell-commands.js";
import { buildSystemPrompt } from "./system-prompt.js";

/**
 * One conversation facet under AppAgent. Workspace is a SharedWorkspace
 * proxy into the parent's shared checkout — not a per-thread scratch copy.
 */
export class AppThread extends Think<Env> {
  override maxSteps = 40;

  /**
   * Full filesystem surface for code mode's `state.*`. Think's default
   * WorkspaceLike is narrower than createWorkspaceStateBackend needs.
   */
  override workspace: WorkspaceFsLike = new SharedWorkspace(() =>
    this.parentAgent(AppAgent)
  );

  #appId: string | null = null;
  #liveVersionId: string | null = null;
  #model: LanguageModel | null = null;

  override async onStart(): Promise<void> {
    const appId = this.requireAppId();
    this.#appId = appId;

    const parent = await this.parentAgent(AppAgent);
    this.#liveVersionId = await parent.liveVersionId();

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
    return [
      buildSystemPrompt({
        appId: this.#appId ?? this.requireAppId(),
        liveVersionId: this.#liveVersionId ?? "unknown",
      }),
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

  private requireAppId(): string {
    if (this.#appId) {
      return this.#appId;
    }
    const appId = this.parentPath.at(-1)?.name;
    if (!appId) {
      throw new Error(`AppThread ${this.name}: missing parent AppAgent name`);
    }
    return appId;
  }
}
