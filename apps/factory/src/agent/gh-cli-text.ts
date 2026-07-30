import type { CheckRunRecord, PrRecord } from "../forge/wire.js";

export type GhParse =
  | { ok: true; group: "run" | "pr"; action: string; rest: string[] }
  | { ok: false; error: string };

export function parseGhArgs(args: string[]): GhParse {
  const [group, action, ...rest] = args;
  if (!group) {
    return {
      ok: false,
      error: "gh: missing command (try `gh pr …` or `gh run …`)\n",
    };
  }
  if (group !== "pr" && group !== "run") {
    return {
      ok: false,
      error: `gh ${group}: not supported in this shell (use gh pr / gh run)\n`,
    };
  }
  if (!action) {
    return {
      ok: false,
      error: `gh ${group}: missing subcommand\n`,
    };
  }
  return { ok: true, group, action, rest };
}

export function formatPrList(prs: PrRecord[]): string {
  if (prs.length === 0) {
    return "no pull requests\n";
  }
  const lines = [
    "NUMBER  STATE   HEAD              TITLE",
    ...prs.map(
      (p) =>
        `${String(p.number).padEnd(8)}${p.status.padEnd(8)}${p.headBranch.padEnd(18)}${p.title}`
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function formatPrView(pr: PrRecord): string {
  const body = pr.body?.trim() ? `\n\n${pr.body.trim()}\n` : "\n";
  return (
    `title:\t${pr.title}\n` +
    `state:\t${pr.status}\n` +
    `number:\t${pr.number}\n` +
    `head:\t${pr.headBranch} (${pr.headSha.slice(0, 12)})\n` +
    `base:\t${pr.baseBranch}\n` +
    `preview:\t${
      pr.status === "open" && pr.previewSha
        ? `${pr.previewSha.slice(0, 12)} (/a/{app}/preview/${pr.number}/)`
        : "—"
    }\n` +
    body
  );
}

export function formatCheckRuns(runs: CheckRunRecord[]): string {
  if (runs.length === 0) {
    return "no check runs\n";
  }
  const lines = [
    "ID                        STATUS       CONCLUSION  NAME  SHA",
    ...runs.map((r) => {
      const conclusion = (r.conclusion ?? "—").padEnd(12);
      return `${r.id.padEnd(26)}${r.status.padEnd(13)}${conclusion}${r.name.padEnd(6)}${r.sha.slice(0, 12)}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

export function formatCheckRunView(run: CheckRunRecord): string {
  return (
    `id:\t${run.id}\n` +
    `name:\t${run.name}\n` +
    `status:\t${run.status}\n` +
    `conclusion:\t${run.conclusion ?? "—"}\n` +
    `sha:\t${run.sha}\n` +
    `prId:\t${run.prId ?? "—"}\n` +
    (run.detail ? `detail:\t${run.detail}\n` : "")
  );
}
