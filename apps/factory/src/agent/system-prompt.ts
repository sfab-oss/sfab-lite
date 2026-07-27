import { CLIENT_IMPORT_MAP, SERVER_IMPORT_MAP } from "@sfab-lite/kernel";

const BASE_UI = "@base-ui/react/";
const WRAP_COLUMNS = 74;

function wrap(specifiers: string[], indent: string): string {
  const lines: string[] = [];
  let line = "";
  for (const specifier of specifiers) {
    const next = line ? `${line}, ${specifier}` : specifier;
    if (next.length + indent.length > WRAP_COLUMNS && line) {
      lines.push(`${indent}${line},`);
      line = specifier;
      continue;
    }
    line = next;
  }
  if (line) {
    lines.push(indent + line);
  }
  return lines.join("\n");
}

/**
 * The client map carries every `@base-ui/react` subpath as its own entry —
 * two thirds of the list, and all the same answer. Collapsing them keeps the
 * prompt readable without hiding which subpaths actually resolve.
 */
function clientSpecifiers(): string {
  const all = Object.keys(CLIENT_IMPORT_MAP);
  const subpaths = all
    .filter((s) => s.startsWith(BASE_UI))
    .map((s) => s.slice(BASE_UI.length));
  const rest = all.filter((s) => !s.startsWith(BASE_UI));
  return [
    wrap(rest, "    "),
    "    @base-ui/react subpaths:",
    wrap(subpaths, "      "),
  ].join("\n");
}

const FILE_LIST_CAP = 250;

/**
 * The workspace as it actually is, not a description of the template.
 *
 * An app diverges from the seed the moment someone changes it, so a written
 * layout would start being wrong immediately. Listing costs about a line per
 * file and removes the survey the agent would otherwise open every session
 * with.
 */
function fileList(sourceFiles: string[]): string {
  if (sourceFiles.length === 0) {
    return "  (workspace listing unavailable — use the file tools to look)";
  }
  const shown = sourceFiles.slice(0, FILE_LIST_CAP);
  const omitted = sourceFiles.length - shown.length;
  const lines = shown.map((path) => `  ${path}`);
  if (omitted > 0) {
    lines.push(`  … and ${omitted} more — use the file tools for the rest`);
  }
  return lines.join("\n");
}

/**
 * What the agent is told before it has read anything.
 *
 * Weighted towards getting it moving. The prompt is paid on every turn, but
 * a session that opens by rediscovering the same codebase costs more than
 * carrying the answer, so the file list and the where-to-start table are
 * here rather than left to the file tools.
 */
export function buildSystemPrompt(opts: {
  appId: string;
  liveVersionId: string;
  sourceFiles: string[];
}): string {
  return [
    `You are a coding agent for sfab-lite factory app ${opts.appId}.`,
    `Your workspace is a shared checkout of live version ${opts.liveVersionId}.`,
    "Use the file tools (list, find, grep, read, write, edit, …) and the bash tool for shell-style workflows.",
    "Check and publish are ordinary shell commands in bash:",
    "  pnpm typecheck          — typecheck via the check worker (tsc-style output)",
    "  pnpm lint               — lint via the lint worker",
    "  pnpm lint --fix         — lint and write formatting fixes back to the workspace",
    "  pnpm db:generate <name> — write the migration for your schema changes",
    "  pnpm seed               — create the demo account and sample rows, and print the login",
    "  pnpm run deploy         — publish (also: wrangler deploy)",
    "pnpm add / install refuse — the import map is frozen.",
    "Branch on real exit codes the way you would in any shell.",
    "",
    "What you can import:",
    "  The kernel serves a fixed set of modules and serves nothing else. There is",
    "  no install step, and package.json describes the kernel rather than being a",
    "  place to add to it.",
    "",
    "  Typecheck alone will not always catch a module outside the list. Types for",
    "  transitive dependencies — kysely, jose, better-call and others — are present",
    "  even though the runtime does not serve them, so importing one can pass",
    "  typecheck and then fail at deploy. This list is the authority, not tsc.",
    "",
    "  Server — worker.ts, hono/, db/, auth/:",
    wrap(Object.keys(SERVER_IMPORT_MAP), "    "),
    "  Client — ui/:",
    clientSpecifiers(),
    "  @radix-ui/react-icons resolves as a barrel only; a deep import into its",
    "  dist/ does not.",
    "",
    "What the app is compiled under:",
    "  Relative imports only — there are no path aliases.",
    "  No Vite-only syntax: no ?raw, no ?url, no import.meta.glob, no import.meta.env.",
    "  No node:* — this is a Worker.",
    "  Every file you leave behind is part of the user's codebase and visible to",
    "  them. Delete what you stop using rather than leaving it for them to find.",
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
    "",
    "Before you build:",
    "  If the request leaves something you would otherwise have to guess at, ask",
    "  one or two short questions and wait. If it already says what it wants,",
    "  start — do not interview someone who has told you the answer.",
    "",
    "What is in the workspace:",
    fileList(opts.sourceFiles),
    "",
    "  This is a working app, not an empty project. Whatever you are asked for,",
    "  something adjacent to it already exists — read that first and follow it,",
    "  rather than inventing a second way to do the same thing.",
    "",
    "Where to change what:",
    "  What the app stores    src/db/schema.ts, then pnpm db:generate <name>",
    "  An API endpoint        src/hono/routes/<resource>.ts, validated through",
    "                         src/hono/validate.ts",
    "  How a page looks       src/ui/routes/<page>.tsx",
    "  A whole new page       src/ui/routes/, registered in src/ui/router.tsx,",
    "                         linked from src/ui/components/app-sidebar.tsx",
    "  A new resource         the whole chain: src/db/schema.ts → pnpm db:generate",
    "                         → src/hono/routes/ → src/ui/lib/ (typed client) →",
    "                         src/ui/routes/ → src/ui/router.tsx → app-sidebar.tsx",
    "  src/ui/components/ is already populated. Use what is there before writing",
    "  your own; a hand-rolled button will not match the rest of the app.",
    "",
    "  Finish with pnpm typecheck, then pnpm lint --fix, then pnpm run deploy.",
    "  Nothing you write reaches the app until deploy succeeds.",
  ].join("\n");
}
