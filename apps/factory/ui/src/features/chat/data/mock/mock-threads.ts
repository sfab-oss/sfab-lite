import type { SlashCommand, Thread } from "../../model/types";

export const MOCK_COMMANDS: SlashCommand[] = [
  {
    id: "clear",
    name: "clear",
    description: "Clear the composer text",
  },
  {
    id: "help",
    name: "help",
    description: "List available slash commands",
  },
];

const MINUTES_PER_DAY = 24 * 60;

const BILLING = { appId: "app_billing", appName: "Billing" } as const;
const WEBSITE = { appId: "app_website", appName: "Website" } as const;
const NOTES = { appId: "app_notes", appName: "Notes" } as const;

export const MOCK_THREADS: Thread[] = [
  {
    id: "thr_csv_export",
    ...BILLING,
    readOnly: false,
    startedMinutesAgo: 4,
    status: "running",
    title: "CSV export for the invoices list",
    headline: "Writing export query…",
    startedLabel: "4m ago",
    updatedLabel: "now",
    updatedMinutesAgo: 0,
  },
  {
    id: "thr_rounding",
    ...BILLING,
    readOnly: false,
    status: "needs-you",
    title: "Off-by-a-cent invoice totals",
    headline: "Approve schema change?",
    startedLabel: "12m ago",
    updatedLabel: "12m",
    updatedMinutesAgo: 12,
  },
  {
    id: "thr_review_612",
    ...BILLING,
    readOnly: false,
    startedMinutesAgo: 1,
    status: "running",
    title: "Auth helpers for the export path",
    headline: "Checking auth helpers",
    startedLabel: "1m ago",
    updatedLabel: "now",
    updatedMinutesAgo: 1,
  },
  {
    id: "thr_org_roadmap",
    ...BILLING,
    readOnly: false,
    status: "idle",
    title: "What is blocking the billing milestone?",
    startedLabel: "1h ago",
    updatedLabel: "1h",
    updatedMinutesAgo: 60,
  },
  {
    id: "thr_flaky_job",
    ...NOTES,
    readOnly: false,
    status: "idle",
    title: "Nightly sync flakes one run in five",
    startedLabel: "3h ago",
    updatedLabel: "3h",
    updatedMinutesAgo: 180,
  },
  {
    id: "thr_review_608",
    ...BILLING,
    readOnly: false,
    status: "needs-you",
    title: "Typecheck red on invoice totals",
    headline: "2 findings need reply",
    startedLabel: "5h ago",
    updatedLabel: "5h",
    updatedMinutesAgo: 300,
  },
  {
    id: "thr_copy_pass",
    ...WEBSITE,
    readOnly: false,
    status: "done",
    title: "Pricing page copy pass",
    startedLabel: "2 days ago",
    updatedLabel: "2d",
    updatedMinutesAgo: 2 * MINUTES_PER_DAY,
  },
  {
    id: "thr_docs_nav",
    ...WEBSITE,
    readOnly: false,
    status: "done",
    title: "Docs nav restructuring",
    startedLabel: "10 days ago",
    updatedLabel: "10d",
    updatedMinutesAgo: 10 * MINUTES_PER_DAY,
  },
  {
    id: "thr_webhook_retry",
    ...NOTES,
    readOnly: false,
    status: "idle",
    title: "Webhook retry policy",
    startedLabel: "3 weeks ago",
    updatedLabel: "3w",
    updatedMinutesAgo: 21 * MINUTES_PER_DAY,
  },
  {
    id: "thr_seed_script",
    ...NOTES,
    readOnly: false,
    status: "done",
    title: "Local seed script cleanup",
    startedLabel: "6 weeks ago",
    updatedLabel: "6w",
    updatedMinutesAgo: 45 * MINUTES_PER_DAY,
  },
];
