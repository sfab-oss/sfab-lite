import type { CheckResult, LintResult } from "@sfab-lite/core";

const APP_PREFIX = "/app/";

function displayCheckPath(file: string | undefined): string {
  if (!file) {
    return "<unknown>";
  }
  if (file.startsWith(APP_PREFIX)) {
    return file.slice(APP_PREFIX.length);
  }
  return file.startsWith("/") ? file.slice(1) : file;
}

/** tsc-style text a model already knows how to read. */
export function renderCheckText(body: CheckResult | null): string {
  if (!body) {
    return "error TS0000: check worker returned no body\n";
  }
  if (!body.ok) {
    return "error TS0000: check worker reported ok=false\n";
  }
  if (body.diagnosticCount === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const d of body.diagnostics) {
    const path = displayCheckPath(d.file);
    lines.push(`${path}: error TS${d.code}: ${d.message}`);
  }
  if (body.truncated) {
    lines.push(
      `… ${body.diagnosticCount - body.diagnostics.length} more diagnostic(s) truncated`
    );
  }
  lines.push(
    `Found ${body.diagnosticCount} error${body.diagnosticCount === 1 ? "" : "s"}.`
  );
  return `${lines.join("\n")}\n`;
}

function appendLintFileLines(
  lines: string[],
  file: LintResult["files"][number]
): void {
  if (file.error) {
    lines.push(`${file.path}: error: ${file.error}`);
    return;
  }
  for (const d of file.diagnostics) {
    const sev = d.severity ?? "error";
    const cat = d.category ? ` ${d.category}` : "";
    lines.push(`${file.path}: ${sev}${cat}: ${d.message}`);
  }
  if (file.truncated) {
    lines.push(
      `${file.path}: … ${file.diagnosticCount - file.diagnostics.length} more diagnostic(s) truncated`
    );
  }
}

/** Biome-style text for lint diagnostics (and format summaries). */
export function renderLintText(
  body: LintResult | null,
  opts?: { wroteFiles?: string[] }
): string {
  if (!body) {
    return "lint: lint worker returned no body\n";
  }
  if (!body.ok) {
    return "lint: lint worker reported ok=false\n";
  }
  const lines: string[] = [];
  for (const file of body.files) {
    appendLintFileLines(lines, file);
  }
  if (opts?.wroteFiles?.length) {
    lines.push(`Formatted ${opts.wroteFiles.length} file(s):`);
    for (const p of opts.wroteFiles) {
      lines.push(`  ${p}`);
    }
  }
  if (
    body.errorCount === 0 &&
    body.warningCount === 0 &&
    !opts?.wroteFiles?.length
  ) {
    return lines.length ? `${lines.join("\n")}\n` : "";
  }
  lines.push(
    `Found ${body.errorCount} error${body.errorCount === 1 ? "" : "s"} and ${body.warningCount} warning${body.warningCount === 1 ? "" : "s"}.`
  );
  return `${lines.join("\n")}\n`;
}
