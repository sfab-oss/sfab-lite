import { type AiSdkChat, createChat } from "@shadcn/helpers/ai-sdk";
import { listThreadSubagents, type MockSubagent } from "./mock-subagents";

const DELTA_DELAY_MS = 35;
const TOOL_RUN_MS = 700;
const FIRST_TOKEN_DELAY_MS = 550;

const FALLBACK_ASK_RE = /\b(help|blocked|stuck|what should|clarify|ask)\b/;
const FALLBACK_ERROR_RE = /\b(fail|error|broken|red)\b/;
const FALLBACK_TEST_RE = /\b(test|tests|ci|typecheck)\b/;
const FALLBACK_REVIEW_RE = /\b(review|pr|#\d+|diff)\b/;

type MockChat = AiSdkChat;

interface ChatWriter {
  reasoning: (text: string) => unknown;
  sleep: (ms: number) => unknown;
  text: (text: string) => unknown;
  tool: (
    name: string,
    options?: { input?: unknown; toolCallId?: string }
  ) => {
    error: (errorText?: string) => unknown;
    output: (output?: unknown) => unknown;
    sleep: (ms: number) => {
      error: (errorText?: string) => unknown;
      output: (output?: unknown) => unknown;
    };
  };
}

function writeTaskTool(writer: ChatWriter, run: MockSubagent) {
  const handle = writer.tool("task", {
    toolCallId: run.id,
    input: {
      description: run.title,
      prompt: run.prompt,
      runId: run.id,
      agentId: run.seed,
      subagentType: { kind: run.agentType },
    },
  });
  if (run.status === "running") {
    return;
  }
  if (run.status === "failed") {
    handle
      .sleep(TOOL_RUN_MS)
      .error(
        run.steps.find((step) => step.kind === "text")?.label ??
          "Nested run failed"
      );
    return;
  }
  handle.sleep(TOOL_RUN_MS).output({
    durationMs: run.durationMs,
    conversationSteps: run.steps.map((step) => ({ kind: step.kind })),
    agentId: run.seed,
  });
}

function writeThreadTasks(writer: ChatWriter, threadId: string) {
  for (const run of listThreadSubagents(threadId)) {
    writeTaskTool(writer, run);
  }
}

function requireSubagent(threadId: string, runId: string): MockSubagent {
  const run = listThreadSubagents(threadId).find((entry) => entry.id === runId);
  if (!run) {
    throw new Error(`Missing mock subagent ${runId} on ${threadId}`);
  }
  return run;
}

function lastUserText(
  messages: { parts: { type: string; text?: string }[]; role: string }[]
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") {
      continue;
    }
    return message.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text" && typeof part.text === "string"
      )
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function writeFallback(
  writer: ChatWriter,
  messages: { parts: { type: string; text?: string }[]; role: string }[],
  timing: { firstTokenMs: number; toolRunMs: number }
) {
  const text = lastUserText(messages).toLowerCase();
  writer.sleep(timing.firstTokenMs);

  if (FALLBACK_ASK_RE.test(text)) {
    writer.reasoning(
      "This needs a product call more than more code. Better to surface the question than guess."
    );
    writer
      .tool("tasks_get", { input: { id: "ALW-200" } })
      .sleep(timing.toolRunMs)
      .output({
        status: "in-progress",
        title: "CSV export ignores active invoice filters",
      });
    writer.text(
      "Before I keep going — should the export include **voided** invoices when the table filter is “All”, or only when “Voided” is selected?\n\nALW-200 doesn’t pin that down, and the two answers change the query shape."
    );
    return;
  }

  if (FALLBACK_ERROR_RE.test(text)) {
    writer.reasoning(
      "Start from the failing command, not the symptom description."
    );
    writer
      .tool("Bash", {
        input: { command: "pnpm --filter @sfab/billing test -- invoices" },
      })
      .sleep(timing.toolRunMs)
      .error("AssertionError: expected 3 rows, received 4 (exit 1)");
    writer.text(
      "The suite is red on `exportInvoicesCsv` — it still emits voided rows when the active filter is `status=open`. I’ll tighten the WHERE clause and re-run before touching anything else."
    );
    return;
  }

  if (FALLBACK_TEST_RE.test(text)) {
    writer.reasoning(
      "Run the narrowest suite first so we know whether this is the change or the environment."
    );
    writer
      .tool("Bash", {
        input: { command: "pnpm --filter @sfab/billing test -- invoices" },
      })
      .sleep(timing.toolRunMs)
      .output({ passed: 14, failed: 0, durationMs: 1820 });
    writer
      .tool("Bash", {
        input: { command: "pnpm --filter @sfab/billing typecheck" },
      })
      .sleep(timing.toolRunMs)
      .output({ ok: true });
    writer.text(
      "Billing tests and typecheck are green. Ready to push whenever you want."
    );
    return;
  }

  if (FALLBACK_REVIEW_RE.test(text)) {
    writer.reasoning(
      "Read the task + diff before commenting — reviews that skip either tend to invent findings."
    );
    writer
      .tool("tasks_get", { input: { id: "ALW-200" } })
      .sleep(timing.toolRunMs)
      .output({
        status: "in-progress",
        title: "CSV export ignores active invoice filters",
      });
    writer
      .tool("Read", { input: { path: "review/pr.diff", limit: 120 } })
      .sleep(timing.toolRunMs)
      .output({ lines: 120, truncated: true });
    writer
      .tool("Grep", {
        input: {
          path: "apps/billing",
          pattern: "exportInvoicesCsv",
        },
      })
      .sleep(timing.toolRunMs)
      .output({ matches: 3 });
    writer.text(
      "No blocking findings on the export path — filters flow from the same object the table uses. One nit: the CSV header still hardcodes column titles; fine for now, but it’ll drift if the table renames a column.\n\n**Verdict:** approve with nit."
    );
    return;
  }

  writer.reasoning(
    "Worth checking the bound task and the open PR before answering — both may already say something about this."
  );
  writer
    .tool("tasks_get", { input: { id: "ALW-200" } })
    .sleep(timing.toolRunMs)
    .output({ status: "in-progress", assignee: "alwurts" });
  writer
    .tool("Read", {
      input: { path: "src/features/invoices/lib/export-invoices-csv.ts" },
    })
    .sleep(timing.toolRunMs)
    .output({ lines: 48, exists: true });
  writer
    .tool("Bash", {
      input: { command: "pnpm --filter @sfab/billing test -- export" },
    })
    .sleep(timing.toolRunMs)
    .output({ passed: 6, failed: 0 });
  writer.text(
    "ALW-200 is still in progress and #612 carries the change. Nothing there contradicts what you asked, so I’ve gone ahead with it."
  );
}

const THREAD_SCRIPTS: Record<string, () => MockChat> = {
  thr_copy_pass: () =>
    createChat()
      .user("Tighten the pricing page copy — it reads like a spec sheet.")
      .assistant(({ writer }) => {
        writer.reasoning(
          "Marketing copy should lead with outcomes. The current tiers list features first, which is why it feels like a spec."
        );
        writer
          .tool("Read", { input: { path: "apps/website/src/pricing.tsx" } })
          .sleep(TOOL_RUN_MS)
          .output({ lines: 214 });
        writer
          .tool("Grep", {
            input: { path: "apps/website", pattern: "tier\\.(name|features)" },
          })
          .sleep(TOOL_RUN_MS)
          .output({ matches: 9 });
        writer.text(
          "Rewrote the three tier descriptions around what each unblocks rather than what it contains. The feature table stays; it just no longer carries the persuasion."
        );
      })
      .user("Ship it — open a PR.")
      .assistant(({ writer }) => {
        writer
          .tool("Bash", {
            input: {
              command:
                "git push -u origin HEAD && gh pr create --title 'Pricing copy pass'",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            pr: 618,
            url: "https://github.com/sfab-oss/sfab/pull/618",
          });
        writer.text("Opened #618 with the copy pass. Ready for review.");
      }),

  thr_csv_export: () =>
    createChat()
      .user(
        "Add a CSV export to the invoices list page. It should respect the active filters.",
        {
          files: [
            {
              filename: "invoice-filters-screenshot.png",
              mediaType: "image/png",
              url: "https://placehold.co/64x64/png",
            },
            {
              filename: "desired-columns.txt",
              mediaType: "text/plain",
              url: "https://example.com/desired-columns.txt",
            },
          ],
        }
      )
      .assistant(({ writer }) => {
        writer.sleep(FIRST_TOKEN_DELAY_MS);
        writer.reasoning(
          "The list page already derives a typed filter object for its query. If the export takes that object instead of re-reading the URL, the two can never disagree — which is the actual complaint in ALW-200."
        );
        writer.stepStart();
        writer
          .tool("tasks_get", { input: { id: "ALW-200" } })
          .sleep(TOOL_RUN_MS)
          .output({
            status: "in-progress",
            title: "CSV export ignores active invoice filters",
            acceptance: [
              "Export uses the same filter object as the table",
              "Column order matches visible columns",
            ],
          });
        writer
          .tool("Read", {
            input: { path: "src/features/invoices/use-invoices.ts" },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            exports: ["useInvoices", "InvoiceFilters"],
            lines: 96,
          });
        writer
          .tool("Grep", {
            input: {
              path: "src/features/invoices",
              pattern: "export.*Csv|downloadCsv",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ matches: 0 });
        writeTaskTool(
          writer,
          requireSubagent("thr_csv_export", "run_explore_filters")
        );
        writer.stepStart();
        writer.text(
          "ALW-200 describes exactly this: the export re-parses the URL while the table uses a derived filter object. I’ll add `exportInvoicesCsv(filters)` taking the same value the table renders from, so column order and row set follow the table by construction."
        );
      })
      .user("Good. Keep voided rows out unless that filter is on.")
      .assistant(({ writer }) => {
        writer.reasoning(
          "Voided is already a field on InvoiceFilters — wire it through rather than inventing a second flag."
        );
        writeTaskTool(
          writer,
          requireSubagent("thr_csv_export", "run_impl_csv")
        );
        writer
          .tool("StrReplace", {
            input: {
              path: "src/features/invoices/lib/export-invoices-csv.ts",
              old_string: "where status != 'void'",
              new_string: "where (? OR status != 'void')",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ replacements: 1 });
        writer
          .tool("Bash", {
            input: {
              command: "pnpm --filter @sfab/billing test -- export-invoices",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ passed: 8, failed: 0 });
        writer.text(
          "Done — voided rows only appear when the voided chip is active. Suite is green; say the word and I’ll open the PR."
        );
      })
      .user("Open a PR when you’re ready.")
      .assistant(({ writer }) => {
        writer
          .tool("Bash", {
            input: {
              command: "git push -u origin HEAD && gh pr create --fill",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ pr: 612, branch: "alw-200-csv-export-filters" });
        writer
          .tool("comments_create", {
            input: {
              taskId: "ALW-200",
              body: "Opened #612 with export + voided filter behavior.",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ ok: true });
        writer.text(
          "Tests are green. I’ve opened #612 with the export change — review when you have a minute."
        );
      }),

  thr_flaky_job: () =>
    createChat()
      .user("Nightly job flakes one run in five. Dig into ALW-231.")
      .assistant(({ writer }) => {
        writer.reasoning(
          "Start from the last five failures and look for a shared step — if none, it’s timing, not a deterministic bug."
        );
        writer
          .tool("tasks_get", { input: { id: "ALW-231" } })
          .sleep(TOOL_RUN_MS)
          .output({
            status: "todo",
            title: "Nightly reconciliation flakes ~20%",
          });
        writer
          .tool("Bash", {
            input: {
              command:
                "gh run list --workflow nightly.yml --limit 20 --json conclusion,databaseId",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            failed: 4,
            total: 20,
            failingStep: "reconcile-ledger",
          });
        writer
          .tool("Grep", {
            input: {
              path: "apps/platform/src/jobs",
              pattern: "reconcileLedger|setTimeout|retry",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ matches: 6 });
        writer.text(
          "Four of the last twenty nightlies failed, all in `reconcile-ledger`. No shared stack — the step races a D1 write that sometimes isn’t visible yet.\n\nI’ll add a short poll with backoff before asserting, and leave a note on ALW-231."
        );
      })
      .user("Do it. Prefer polling over sleeping.")
      .assistant(({ writer }) => {
        writer
          .tool("Read", {
            input: {
              path: "apps/platform/src/jobs/reconcile-ledger.ts",
              offset: 80,
              limit: 60,
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ lines: 60 });
        writer
          .tool("StrReplace", {
            input: {
              path: "apps/platform/src/jobs/reconcile-ledger.ts",
              old_string: "await sleep(2000)",
              new_string: "await waitForLedgerRow(invoiceId, { attempts: 5 })",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ replacements: 1 });
        writer.text(
          "Replaced the fixed sleep with `waitForLedgerRow` (5 attempts, exponential backoff). I’ll leave the PR draft until we see a clean nightly."
        );
      }),

  thr_org_roadmap: () =>
    createChat()
      .user("What is blocking the billing milestone?")
      .assistant(({ writer }) => {
        writer.sleep(FIRST_TOKEN_DELAY_MS);
        writer.reasoning(
          "This spans projects, so the answer has to come from task state rather than any single repo."
        );
        writer
          .tool("tasks_list", {
            input: { milestone: "billing", status: "open" },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            open: 3,
            blocked: 1,
            items: ["ALW-214", "ALW-200", "ALW-231"],
          });
        writer
          .tool("tasks_get", { input: { id: "ALW-214" } })
          .sleep(TOOL_RUN_MS)
          .output({
            status: "blocked",
            blockedBy: "PR #608 typecheck failing",
            title: "Off-by-a-cent invoice totals",
          });
        writer
          .tool("tasks_get", { input: { id: "ALW-200" } })
          .sleep(TOOL_RUN_MS)
          .output({ status: "in-progress", title: "CSV export filters" });
        writer.text(
          "Three open, one actually blocking: ALW-214 is the correctness bug, and #608 is the fix sitting on a failing typecheck. ALW-200 is in progress and not on the critical path."
        );
      })
      .user("Who owns unblocking #608?")
      .assistant(({ writer }) => {
        writer
          .tool("Bash", {
            input: {
              command:
                "gh pr view 608 --json author,reviewRequests,statusCheckRollup",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            author: "alwurts",
            checks: { failing: ["typecheck"], pending: [] },
          });
        writer.text(
          "You do — #608 is yours, and typecheck is the only red check. Fix that and the billing milestone unblocks."
        );
      }),

  thr_review_608: () =>
    createChat()
      .user(
        "# Review request: ALW-214 — off-by-a-cent invoice totals\n\n**Repo:** sfab-oss/sfab\n**PR:** #608\n\nSynthesize one review, then call `review-submit` exactly once."
      )
      .assistant(({ writer }) => {
        writer.reasoning(
          "Summing in minor units is the right fix, but I should confirm every path actually uses it — a leftover per-line round will leave the bug half-fixed."
        );
        writer
          .tool("Read", { input: { path: "review/pr.diff", limit: 200 } })
          .sleep(TOOL_RUN_MS)
          .output({ additions: 86, deletions: 41, files: 4 });
        writer
          .tool("Grep", {
            input: {
              path: "apps/billing",
              pattern: "roundCurrency|toFixed\\(2\\)",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            matches: [
              "lib/totals.ts:41",
              "lib/line-total.ts:18",
              "components/invoice-summary.tsx:72",
            ],
          });
        writer
          .tool("Read", {
            input: { path: "apps/billing/src/lib/line-total.ts" },
          })
          .sleep(TOOL_RUN_MS)
          .output({ lines: 42 });
        writer.text(
          "Summing in minor units is the right fix, but the rounding helper is still called per line in `line-total.ts`, so #608 does not fully close ALW-214.\n\n**Findings**\n1. `line-total.ts` still rounds before the sum — request changes.\n2. Tests only cover the happy path; add a multi-line fixture with half-cent lines.\n\n**Verdict:** request changes."
        );
      }),

  thr_review_612: () =>
    createChat()
      .user(
        "# Review request: ALW-200 — CSV export filters\n\n**Repo:** sfab-oss/sfab\n**PR:** #612\n\nExplore the staged workspace, then call `review-submit`.",
        {
          files: [
            {
              filename: "pr-612.diff",
              mediaType: "text/x-diff",
              url: "https://example.com/pr-612.diff",
            },
          ],
        }
      )
      .assistant(({ writer }) => {
        writer.reasoning(
          "The claim is that column order follows the table by construction. That is worth checking rather than taking on faith."
        );
        writer
          .tool("tasks_get", { input: { id: "ALW-200" } })
          .sleep(TOOL_RUN_MS)
          .output({
            status: "in-progress",
            title: "CSV export ignores active invoice filters",
          });
        writer
          .tool("Read", { input: { path: "review/pr.diff", limit: 160 } })
          .sleep(TOOL_RUN_MS)
          .output({ additions: 148, deletions: 12, files: 3 });
        writer
          .tool("Read", {
            input: {
              path: "apps/billing/src/features/invoices/lib/export-invoices-csv.ts",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ lines: 48 });
        writer
          .tool("Grep", {
            input: {
              path: "apps/billing/src/features/invoices",
              pattern: "INVOICE_COLUMNS|columnDefs",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({ matches: 2 });
        writeThreadTasks(writer, "thr_review_612");
        writer.text(
          "The export reads the table’s own column definitions, so order cannot drift. Filters come from the same `InvoiceFilters` object. No findings on #612.\n\n**Verdict:** approve."
        );
      }),

  thr_rounding: () =>
    createChat()
      .user("Totals are off by a cent on multi-line invoices. Find out why.", {
        files: [
          {
            filename: "invoice-sample.csv",
            mediaType: "text/csv",
            url: "https://example.com/invoice-sample.csv",
          },
        ],
      })
      .assistant(({ writer }) => {
        writer.reasoning(
          "Rounding per line then summing accumulates each line’s half-cent error. Summing in minor units and rounding once at the end is the standard fix — confirm that’s what the code does today."
        );
        writer
          .tool("tasks_search", {
            input: { query: "invoice rounding cent" },
          })
          .sleep(TOOL_RUN_MS)
          .output({ hits: ["ALW-214"] });
        writer
          .tool("Read", {
            input: { path: "apps/billing/src/lib/totals.ts" },
          })
          .sleep(TOOL_RUN_MS)
          .output({ lines: 58 });
        writer
          .tool("Bash", {
            input: {
              command:
                "pnpm --filter @sfab/billing test -- totals --reporter=verbose",
            },
          })
          .sleep(TOOL_RUN_MS)
          .output({
            passed: 5,
            failed: 1,
            failing: "multi-line half-cent fixture",
          });
        writeTaskTool(
          writer,
          requireSubagent("thr_rounding", "run_find_rounding")
        );
        writer.text(
          "Line totals are rounded before summing, so each line’s half-cent error accumulates — that is ALW-214. I’ve pushed the minor-units fix as #608, but its typecheck is failing and I’d rather you look before I force it green."
        );
      })
      .user("What’s failing typecheck?")
      .assistant(({ writer }) => {
        writeTaskTool(
          writer,
          requireSubagent("thr_rounding", "run_typecheck_fail")
        );
        writer
          .tool("Bash", {
            input: { command: "pnpm --filter @sfab/billing typecheck" },
          })
          .sleep(TOOL_RUN_MS)
          .error(
            "totals.ts(41,12): error TS2322: Type 'number' is not assignable to type 'MinorUnits'."
          );
        writer.text(
          "`sumMinor` returns `number` but the caller expects `MinorUnits`. Easy cast at the boundary — want me to fix and push, or do you want to take #608?"
        );
      }),
};

export function createThreadChat(threadId: string): MockChat {
  const script = THREAD_SCRIPTS[threadId];
  return script ? script() : createChat();
}

export interface ThreadAttachedFile {
  filename: string;
  mediaType?: string;
  url?: string;
}

export function listThreadAttachedFiles(
  threadId: string
): ThreadAttachedFile[] {
  const messages = createThreadChat(threadId).get();
  const seen = new Set<string>();
  const files: ThreadAttachedFile[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "file") {
        continue;
      }
      const filename =
        typeof part.filename === "string" && part.filename.length > 0
          ? part.filename
          : "Attachment";
      if (seen.has(filename)) {
        continue;
      }
      seen.add(filename);
      files.push({
        filename,
        mediaType:
          typeof part.mediaType === "string" ? part.mediaType : undefined,
        url: typeof part.url === "string" ? part.url : undefined,
      });
    }
  }

  return files;
}

export function createThreadTransport(
  chat: MockChat,
  timing?: { delayMs?: number; firstTokenMs?: number; toolRunMs?: number }
) {
  const firstTokenMs = timing?.firstTokenMs ?? FIRST_TOKEN_DELAY_MS;
  const toolRunMs = timing?.toolRunMs ?? TOOL_RUN_MS;
  const delayMs =
    timing && "delayMs" in timing ? timing.delayMs : DELTA_DELAY_MS;

  return chat.transport({
    delayMs,
    fallback: ({ writer, messages }) => {
      writeFallback(writer, messages, { firstTokenMs, toolRunMs });
    },
  });
}
