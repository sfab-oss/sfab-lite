/**
 * Structural validator for manifest v0. No filesystem, no interpolation,
 * exact records except the runtime line pin. Issues are collected, not
 * fail-fast — an agent should see every problem in one pass.
 */

import type { AdapterTarget, ManifestV0 } from "./manifest.js";

const FORMAT = 0;
const TARGETS: readonly AdapterTarget[] = ["cloudflare"];

export interface ManifestIssue {
  path: string;
  message: string;
}

export type ManifestValidation =
  | { ok: true; manifest: ManifestV0 }
  | { ok: false; issues: ManifestIssue[] };

const TOP_KEYS = new Set([
  "format",
  "name",
  "runtime",
  "adapter",
  "root",
  "server",
  "client",
  "html",
  "safelist",
  "migrations",
  "schema",
  "inject",
  "source",
  "capabilities",
  "modules",
  "recipes",
]);

const SERVER_KEYS = new Set(["entry", "exportName"]);
const CLIENT_KEYS = new Set(["entry", "styles"]);
const SOURCE_KEYS = new Set(["dirs", "extensions", "files", "exclude"]);
const RECIPE_KEYS = new Set(["version", "files"]);
const MODULE_KEYS = new Set(["name", "version"]);

const LINE_PIN = /^\^\d+$/;
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const RECIPE_NAME_RE =
  /^lite\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const INTERPOLATION = /\$\{|\{\{/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function add(issues: ManifestIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function unknownKeys(
  issues: ManifestIssue[],
  path: string,
  value: Record<string, unknown>,
  allowed: Set<string>
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      add(issues, path === "" ? key : `${path}.${key}`, "unknown key");
    }
  }
}

function requireString(
  issues: ManifestIssue[],
  path: string,
  value: unknown
): string | null {
  if (typeof value !== "string") {
    add(issues, path, "expected a string");
    return null;
  }
  if (value.length === 0) {
    add(issues, path, "expected a non-empty string");
    return null;
  }
  if (INTERPOLATION.test(value)) {
    add(issues, path, "interpolation is not allowed");
    return null;
  }
  return value;
}

function requireStringArray(
  issues: ManifestIssue[],
  path: string,
  value: unknown
): string[] | null {
  if (!Array.isArray(value)) {
    add(issues, path, "expected an array of strings");
    return null;
  }
  const out: string[] = [];
  let ok = true;
  for (const [i, item] of value.entries()) {
    const s = requireString(issues, `${path}[${i}]`, item);
    if (s === null) {
      ok = false;
    } else {
      out.push(s);
    }
  }
  return ok ? out : null;
}

function requireExactVersion(
  issues: ManifestIssue[],
  path: string,
  value: unknown
): string | null {
  const s = requireString(issues, path, value);
  if (s === null) {
    return null;
  }
  if (!EXACT_VERSION_RE.test(s)) {
    add(issues, path, "expected an exact version (no ranges)");
    return null;
  }
  return s;
}

function validateServer(
  issues: ManifestIssue[],
  value: unknown
): ManifestV0["server"] | null {
  if (!isPlainObject(value)) {
    add(issues, "server", "expected an object");
    return null;
  }
  unknownKeys(issues, "server", value, SERVER_KEYS);
  const entry = requireString(issues, "server.entry", value.entry);
  const exportName = requireString(
    issues,
    "server.exportName",
    value.exportName
  );
  if (entry === null || exportName === null) {
    return null;
  }
  return { entry, exportName };
}

function validateClient(
  issues: ManifestIssue[],
  value: unknown
): ManifestV0["client"] | null {
  if (!isPlainObject(value)) {
    add(issues, "client", "expected an object");
    return null;
  }
  unknownKeys(issues, "client", value, CLIENT_KEYS);
  const entry = requireString(issues, "client.entry", value.entry);
  const styles = requireString(issues, "client.styles", value.styles);
  if (entry === null || styles === null) {
    return null;
  }
  return { entry, styles };
}

function validateSource(
  issues: ManifestIssue[],
  value: unknown
): ManifestV0["source"] | null {
  if (!isPlainObject(value)) {
    add(issues, "source", "expected an object");
    return null;
  }
  unknownKeys(issues, "source", value, SOURCE_KEYS);
  const dirs = requireStringArray(issues, "source.dirs", value.dirs);
  const extensions = requireStringArray(
    issues,
    "source.extensions",
    value.extensions
  );
  const files = requireStringArray(issues, "source.files", value.files);
  const exclude = requireStringArray(issues, "source.exclude", value.exclude);
  if (
    dirs === null ||
    extensions === null ||
    files === null ||
    exclude === null
  ) {
    return null;
  }
  return { dirs, extensions, files, exclude };
}

function validateInject(
  issues: ManifestIssue[],
  value: unknown
): Record<string, string> | null {
  if (!isPlainObject(value)) {
    add(issues, "inject", "expected an object");
    return null;
  }
  const out: Record<string, string> = {};
  let ok = true;
  for (const [dest, src] of Object.entries(value)) {
    if (INTERPOLATION.test(dest)) {
      add(issues, `inject.${dest}`, "interpolation is not allowed");
      ok = false;
      continue;
    }
    const s = requireString(issues, `inject.${dest}`, src);
    if (s === null) {
      ok = false;
    } else {
      out[dest] = s;
    }
  }
  return ok ? out : null;
}

function validateModules(
  issues: ManifestIssue[],
  value: unknown
): ManifestV0["modules"] | null {
  if (!Array.isArray(value)) {
    add(issues, "modules", "expected an array");
    return null;
  }
  const out: ManifestV0["modules"] = [];
  let ok = true;
  for (const [i, item] of value.entries()) {
    const path = `modules[${i}]`;
    if (!isPlainObject(item)) {
      add(issues, path, "expected an object");
      ok = false;
      continue;
    }
    unknownKeys(issues, path, item, MODULE_KEYS);
    const name = requireString(issues, `${path}.name`, item.name);
    const version = requireExactVersion(
      issues,
      `${path}.version`,
      item.version
    );
    if (name === null || version === null) {
      ok = false;
    } else {
      out.push({ name, version });
    }
  }
  return ok ? out : null;
}

function validateRecipeFiles(
  issues: ManifestIssue[],
  path: string,
  value: unknown
): Record<string, string> | null {
  if (!isPlainObject(value)) {
    add(issues, path, "expected an object");
    return null;
  }
  const out: Record<string, string> = {};
  let ok = true;
  for (const [file, hash] of Object.entries(value)) {
    const filePath = `${path}.${file}`;
    if (INTERPOLATION.test(file)) {
      add(issues, filePath, "interpolation is not allowed");
      ok = false;
      continue;
    }
    const s = requireString(issues, filePath, hash);
    if (s === null) {
      ok = false;
    } else if (SHA256_RE.test(s)) {
      out[file] = s;
    } else {
      add(issues, filePath, "expected sha256:<64 lowercase hex>");
      ok = false;
    }
  }
  return ok ? out : null;
}

function validateRecipes(
  issues: ManifestIssue[],
  value: unknown
): ManifestV0["recipes"] | null {
  if (!isPlainObject(value)) {
    add(issues, "recipes", "expected an object");
    return null;
  }
  const out: ManifestV0["recipes"] = {};
  let ok = true;
  for (const [name, rec] of Object.entries(value)) {
    if (!RECIPE_NAME_RE.test(name)) {
      add(
        issues,
        `recipes.${name}`,
        "recipe names must be lite/<slug> (bare names are an error)"
      );
      ok = false;
      continue;
    }
    const path = `recipes.${name}`;
    if (!isPlainObject(rec)) {
      add(issues, path, "expected an object");
      ok = false;
      continue;
    }
    unknownKeys(issues, path, rec, RECIPE_KEYS);
    const version = requireExactVersion(issues, `${path}.version`, rec.version);
    const files = validateRecipeFiles(issues, `${path}.files`, rec.files);
    if (version === null || files === null) {
      ok = false;
    } else {
      out[name] = { version, files };
    }
  }
  return ok ? out : null;
}

function validateCapabilities(
  issues: ManifestIssue[],
  value: unknown
): string[] | null {
  return requireStringArray(issues, "capabilities", value);
}

function validateRuntime(
  issues: ManifestIssue[],
  value: unknown
): string | null {
  const s = requireString(issues, "runtime", value);
  if (s === null) {
    return null;
  }
  if (!LINE_PIN.test(s)) {
    add(issues, "runtime", "expected a line pin ^N (integer N)");
    return null;
  }
  return s;
}

function validateAdapter(
  issues: ManifestIssue[],
  value: unknown
): AdapterTarget | null {
  const s = requireString(issues, "adapter", value);
  if (s === null) {
    return null;
  }
  if (!(TARGETS as readonly string[]).includes(s)) {
    add(issues, "adapter", `unknown adapter target "${s}"`);
    return null;
  }
  return s as AdapterTarget;
}

function validateFormat(issues: ManifestIssue[], value: unknown): 0 | null {
  if (value !== FORMAT) {
    add(issues, "format", `expected literal ${FORMAT}`);
    return null;
  }
  return FORMAT;
}

export function validateManifest(input: unknown): ManifestValidation {
  const issues: ManifestIssue[] = [];
  if (!isPlainObject(input)) {
    return {
      ok: false,
      issues: [{ path: "", message: "expected a JSON object" }],
    };
  }
  unknownKeys(issues, "", input, TOP_KEYS);

  const format = validateFormat(issues, input.format);
  const name = requireString(issues, "name", input.name);
  const runtime = validateRuntime(issues, input.runtime);
  const adapter = validateAdapter(issues, input.adapter);
  const root = requireString(issues, "root", input.root);
  const server = validateServer(issues, input.server);
  const client = validateClient(issues, input.client);
  const html = requireString(issues, "html", input.html);
  const safelist = requireString(issues, "safelist", input.safelist);
  const migrations = requireString(issues, "migrations", input.migrations);
  const schema = requireString(issues, "schema", input.schema);
  const inject = validateInject(issues, input.inject);
  const source = validateSource(issues, input.source);
  const capabilities = validateCapabilities(issues, input.capabilities);
  const modules = validateModules(issues, input.modules);
  const recipes = validateRecipes(issues, input.recipes);

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (
    format === null ||
    name === null ||
    runtime === null ||
    adapter === null ||
    root === null ||
    server === null ||
    client === null ||
    html === null ||
    safelist === null ||
    migrations === null ||
    schema === null ||
    inject === null ||
    source === null ||
    capabilities === null ||
    modules === null ||
    recipes === null
  ) {
    return {
      ok: false,
      issues: [{ path: "", message: "internal: missing field without issue" }],
    };
  }

  return {
    ok: true,
    manifest: {
      format,
      name,
      runtime,
      adapter,
      root,
      server,
      client,
      html,
      safelist,
      migrations,
      schema,
      inject,
      source,
      capabilities,
      modules,
      recipes,
    },
  };
}
