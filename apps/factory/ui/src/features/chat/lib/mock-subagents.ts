import type { DynamicToolUIPart, UIMessage } from "ai";

type MockSubagentStatus = "done" | "failed" | "running";

interface MockSubagentStep {
  detail?: string;
  kind: "reasoning" | "text" | "tool";
  label: string;
}

export interface MockSubagent {
  agentType: string;
  durationMs?: number;
  id: string;
  prompt: string;
  seed: string;
  status: MockSubagentStatus;
  steps: MockSubagentStep[];
  title: string;
}

export type NestedRunUIMessage = UIMessage;

const BY_THREAD: Record<string, MockSubagent[]> = {
  thr_csv_export: [
    {
      id: "run_explore_filters",
      seed: "ctr_7f3a91b2e01c",
      title: "Map invoice filter object",
      agentType: "explore",
      status: "done",
      durationMs: 18_400,
      prompt:
        "Find where the invoice list page builds InvoiceFilters and whether export re-parses the URL. Report the single object export should take.",
      steps: [
        {
          kind: "reasoning",
          label:
            "Find where the list page builds InvoiceFilters and whether export re-parses the URL.",
        },
        {
          kind: "tool",
          label: "Grep",
          detail: "InvoiceFilters|useInvoices · src/features/invoices",
        },
        {
          kind: "tool",
          label: "Read",
          detail: "src/features/invoices/use-invoices.ts",
        },
        {
          kind: "text",
          label:
            "Filters are derived once in useInvoices. Export must take that object — not re-read search params.",
        },
      ],
    },
    {
      id: "run_impl_csv",
      seed: "ctr_c2e84d01a9f3",
      title: "Implement exportInvoicesCsv",
      agentType: "generalPurpose",
      status: "running",
      prompt:
        "Implement exportInvoicesCsv that shares column defs with the table, then wire the Export button. Keep the helper under src/features/invoices/lib/.",
      steps: [
        {
          kind: "reasoning",
          label: "Add export helper that shares column defs with the table.",
        },
        {
          kind: "tool",
          label: "Read",
          detail: "src/features/invoices/invoice-table.tsx",
        },
        {
          kind: "tool",
          label: "Write",
          detail: "src/features/invoices/lib/export-invoices-csv.ts",
        },
        {
          kind: "text",
          label: "Drafting the helper and wiring the Export button…",
        },
      ],
    },
  ],
  thr_review_612: [
    {
      id: "run_review_diff",
      seed: "ctr_91b0e4a72d58",
      title: "Review PR #612 diff",
      agentType: "explore",
      status: "done",
      durationMs: 42_100,
      prompt:
        "Review PR #612. Check that CSV column order follows the table by construction, not by coincidence. Approve or request changes.",
      steps: [
        {
          kind: "reasoning",
          label:
            "Check that column order follows the table by construction, not by coincidence.",
        },
        {
          kind: "tool",
          label: "Read",
          detail: "review/pr.diff (limit 160)",
        },
        {
          kind: "tool",
          label: "Grep",
          detail: "INVOICE_COLUMNS|columnDefs",
        },
        {
          kind: "text",
          label:
            "Export reads INVOICE_COLUMNS from the same module as the table. Approve.",
        },
      ],
    },
  ],
  thr_rounding: [
    {
      id: "run_find_rounding",
      seed: "ctr_3d6f8a1c0e42",
      title: "Locate half-cent accumulation",
      agentType: "explore",
      status: "done",
      durationMs: 11_200,
      prompt:
        "Locate where half-cent rounding accumulates in billing totals. Confirm against ALW-214 and say whether minor-units is the fix.",
      steps: [
        {
          kind: "tool",
          label: "Read",
          detail: "apps/billing/src/lib/totals.ts",
        },
        {
          kind: "tool",
          label: "Bash",
          detail: "pnpm --filter @sfab/billing test -- totals",
        },
        {
          kind: "text",
          label:
            "Per-line rounding before sum — matches ALW-214. Minor-units fix is the path.",
        },
      ],
    },
    {
      id: "run_typecheck_fail",
      seed: "ctr_b5e1c908f7a4",
      title: "Diagnose typecheck on #608",
      agentType: "shell",
      status: "failed",
      durationMs: 6200,
      prompt:
        "Run typecheck for @sfab/billing on the #608 branch and paste the first actionable error.",
      steps: [
        {
          kind: "tool",
          label: "Bash",
          detail: "pnpm --filter @sfab/billing typecheck",
        },
        {
          kind: "text",
          label:
            "totals.ts(41,12): Type 'number' is not assignable to type 'MinorUnits'.",
        },
      ],
    },
  ],
};

export function listThreadSubagents(threadId: string): MockSubagent[] {
  return BY_THREAD[threadId] ?? [];
}

export function lookupSubagent(
  threadId: string,
  runId: string
): MockSubagent | undefined {
  return listThreadSubagents(threadId).find((run) => run.id === runId);
}

export function nestedRunToMessages(run: MockSubagent): NestedRunUIMessage[] {
  const assistantParts = run.steps.map((step, index) =>
    stepToPart(step, run, index)
  );

  return [
    {
      id: `${run.id}-prompt`,
      role: "user",
      parts: [{ type: "text", text: run.prompt }],
    },
    {
      id: `${run.id}-assistant`,
      role: "assistant",
      parts: assistantParts,
    },
  ];
}

function stepToPart(
  step: MockSubagentStep,
  run: MockSubagent,
  index: number
): NestedRunUIMessage["parts"][number] {
  if (step.kind === "reasoning") {
    return { type: "reasoning", text: step.label, state: "done" };
  }
  if (step.kind === "text") {
    return { type: "text", text: step.label };
  }

  const toolCallId = `${run.id}-tool-${index}`;
  const input = step.detail ? { query: step.detail } : {};
  const isLast = index === run.steps.length - 1;
  const stillOpen = run.status === "running" && isLast;

  if (stillOpen) {
    const open: DynamicToolUIPart = {
      type: "dynamic-tool",
      toolName: step.label,
      toolCallId,
      state: "input-available",
      input,
    };
    return open;
  }

  if (run.status === "failed" && isLast) {
    const errored: DynamicToolUIPart = {
      type: "dynamic-tool",
      toolName: step.label,
      toolCallId,
      state: "output-error",
      input,
      errorText: "Command exited non-zero",
    };
    return errored;
  }

  const done: DynamicToolUIPart = {
    type: "dynamic-tool",
    toolName: step.label,
    toolCallId,
    state: "output-available",
    input,
    output: { ok: true },
  };
  return done;
}
