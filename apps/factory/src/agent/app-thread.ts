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
    const appId = this.#appId ?? this.requireAppId();
    const live = this.#liveVersionId ?? "unknown";
    return [
      `You are a coding agent for sfab-lite factory app ${appId}.`,
      `Your workspace is a shared checkout of live version ${live}.`,
      "Use the file tools (list, find, grep, read, write, edit, …) and the bash tool for shell-style workflows.",
      "Check and publish are ordinary shell commands in bash:",
      "  pnpm typecheck          — typecheck via the check worker (tsc-style output)",
      "  pnpm lint               — lint via the lint worker",
      "  pnpm lint --fix         — lint and write formatting fixes back to the workspace",
      "  pnpm db:generate <name> — write the migration for your schema changes",
      "  pnpm run deploy         — publish (also: wrangler deploy)",
      "pnpm add / install refuse — the import map is frozen.",
      "Branch on real exit codes the way you would in any shell.",
      "",
      "The database:",
      "  src/db/schema.ts declares the tables; migrations/*.sql are what actually",
      "  create them. Editing the schema does not change the database — typecheck",
      "  passes either way, because types describe intent and the database holds",
      "  facts. Closing that gap is your job, not something that happens for you.",
      "  After changing src/db/schema.ts, run pnpm db:generate <name>. It derives",
      "  the SQL from your schema and writes migrations/000N_<name>.sql. Do not",
      "  hand-write migration SQL; a file that disagrees with the schema it claims",
      "  to implement fails at the first query instead of at deploy.",
      "  Deploy applies pending migrations and then refuses if the schema still",
      "  declares anything the database lacks. Additive changes — new tables, new",
      "  nullable columns, new columns with a default — generate cleanly. Dropping",
      "  or retyping a column, or making an existing one NOT NULL, is refused,",
      "  because it would discard rows: change the schema back, or ask the user.",
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
