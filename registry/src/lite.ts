import { createHash } from "node:crypto";
import type { RecipeProvenance } from "@sfab-lite/core";
import type {
  Catalog,
  CatalogEntry,
  Issue,
  ItemValidation,
  LiteFileType,
  LiteItemType,
  RecipeFile,
  RecipeItem,
  RecipeMeta,
} from "./types.js";

export type {
  Catalog,
  CatalogEntry,
  Issue,
  ItemValidation,
  RecipeItem,
} from "./types.js";

/** Must match `RECIPE_NAME_RE` in `@sfab-lite/core`. */
const RECIPE_NAME_RE =
  /^lite\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const LITE_PREFIX = "lite/";
const AT_LITE_PREFIX = "@lite/";
const ITEM_SCHEMA_URL = "https://ui.shadcn.com/schema/registry-item.json";

export const LITE_ITEM_TYPES = [
  "registry:lib",
  "registry:ui",
  "registry:component",
  "registry:block",
  "registry:hook",
  "registry:file",
] as const;

const LITE_FILE_TYPES = [
  "registry:lib",
  "registry:ui",
  "registry:component",
  "registry:hook",
  "registry:file",
] as const;

const LITE_ITEM_KEYS = new Set([
  "name",
  "type",
  "title",
  "description",
  "registryDependencies",
  "files",
  "meta",
]);

const LITE_FILE_KEYS = new Set(["path", "type", "target"]);
const LITE_META_KEYS = new Set(["liteProfile", "liteRuntime"]);
const MIGRATION_TARGET_PREFIXES = ["migrations/"] as const;
const INTERPOLATION = /\$\{|\{\{/;
const LITE_RUNTIME = /^>=\d+\.\d+\.\d+$/;

export function contentHash(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

const BIOME_IGNORE_ALL_HEADER = /^(?:\/\/ biome-ignore-all .+\n)+(?:\n)?/;

export function stripBiomeIgnoreAllHeaders(source: string): string {
  return source.replace(BIOME_IGNORE_ALL_HEADER, "");
}

export interface NameOk {
  ok: true;
  name: string;
}

export interface NameErr {
  ok: false;
  error: string;
}

export type NameResult = NameOk | NameErr;

export function serveSlug(catalogName: string): string {
  return catalogName.startsWith(LITE_PREFIX)
    ? catalogName.slice(LITE_PREFIX.length)
    : catalogName;
}

export function namespacedAddress(catalogName: string): string {
  return `${AT_LITE_PREFIX}${serveSlug(catalogName)}`;
}

/**
 * Lite recipe names live in `lite/` (catalog / provenance) and `@lite/`
 * (CLI / served registry). Bare names hard-error *before* any catalog
 * lookup — they must never reach a resolver that could leak to
 * ui.shadcn.com. Foreign namespaces are refused.
 */
export function parseRecipeName(raw: string): NameResult {
  if (raw.length === 0) {
    return { ok: false, error: "recipe name is empty" };
  }
  if (raw.includes("://")) {
    return {
      ok: false,
      error: `recipe name "${raw}" is not a lite/<slug> or @lite/<slug> name — remote URLs are not resolved`,
    };
  }
  if (raw.startsWith("@")) {
    if (!raw.startsWith(AT_LITE_PREFIX)) {
      return {
        ok: false,
        error: `recipe name "${raw}" is not the @lite namespace — foreign registries are not resolved`,
      };
    }
    const slug = raw.slice(AT_LITE_PREFIX.length);
    if (!SLUG_RE.test(slug)) {
      return {
        ok: false,
        error: `recipe name "${raw}" is not a valid @lite/<slug> (lowercase slugs, slash-separated)`,
      };
    }
    return { ok: true, name: `${LITE_PREFIX}${slug}` };
  }
  if (!raw.startsWith(LITE_PREFIX)) {
    return {
      ok: false,
      error: `bare names are a hard error — "${raw}" never resolves (including not to ui.shadcn.com). Use @lite/<slug> or lite/<slug>.`,
    };
  }
  if (!RECIPE_NAME_RE.test(raw)) {
    return {
      ok: false,
      error: `recipe name "${raw}" is not a valid lite/<slug> (lowercase slugs, slash-separated)`,
    };
  }
  return { ok: true, name: raw };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function add(issues: Issue[], path: string, message: string): void {
  issues.push({ path, message });
}

function unknownKeys(
  issues: Issue[],
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
  issues: Issue[],
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

function validateMeta(issues: Issue[], value: unknown): RecipeMeta | null {
  if (!isPlainObject(value)) {
    add(issues, "meta", "expected an object");
    return null;
  }
  unknownKeys(issues, "meta", value, LITE_META_KEYS);
  if (value.liteProfile !== 1) {
    add(issues, "meta.liteProfile", "expected the positive profile marker 1");
  }
  const liteRuntime = requireString(
    issues,
    "meta.liteRuntime",
    value.liteRuntime
  );
  if (liteRuntime !== null && !LITE_RUNTIME.test(liteRuntime)) {
    add(issues, "meta.liteRuntime", "expected a minimum runtime like >=0.4.0");
  }
  if (value.liteProfile !== 1 || liteRuntime === null) {
    return null;
  }
  return { liteProfile: 1, liteRuntime };
}

function validateTarget(issues: Issue[], path: string, target: string): void {
  if (target.startsWith("/") || target.includes("\\")) {
    add(issues, path, "target must be a relative POSIX path");
  }
  if (target.split("/").includes("..")) {
    add(issues, path, "target must not contain ..");
  }
  for (const prefix of MIGRATION_TARGET_PREFIXES) {
    if (target === prefix.slice(0, -1) || target.startsWith(prefix)) {
      add(
        issues,
        path,
        "recipes must not target applied-migration files (migrations/ is an immutable ledger; ship schema source under src/db/ and let db:generate write SQL)"
      );
    }
  }
  if (target.startsWith("src/generated/")) {
    add(issues, path, "recipes must not target generated snapshot files");
  }
}

function validateFiles(issues: Issue[], value: unknown): RecipeFile[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    add(issues, "files", "expected a non-empty array");
    return null;
  }
  const out: RecipeFile[] = [];
  let ok = true;
  for (const [i, item] of value.entries()) {
    const path = `files[${i}]`;
    if (!isPlainObject(item)) {
      add(issues, path, "expected an object");
      ok = false;
      continue;
    }
    unknownKeys(issues, path, item, LITE_FILE_KEYS);
    const filePath = requireString(issues, `${path}.path`, item.path);
    const target = requireString(issues, `${path}.target`, item.target);
    const type = requireString(issues, `${path}.type`, item.type);
    if (filePath === null || target === null || type === null) {
      ok = false;
      continue;
    }
    if (!(LITE_FILE_TYPES as readonly string[]).includes(type)) {
      add(
        issues,
        `${path}.type`,
        `unknown file type "${type}" (lite allows: ${LITE_FILE_TYPES.join(", ")})`
      );
      ok = false;
      continue;
    }
    validateTarget(issues, `${path}.target`, target);
    out.push({ path: filePath, type: type as LiteFileType, target });
  }
  return ok ? out : null;
}

function validateRegistryDependencies(
  issues: Issue[],
  value: unknown
): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    add(issues, "registryDependencies", "expected an array of strings");
    return null;
  }
  const out: string[] = [];
  let ok = true;
  for (const [i, item] of value.entries()) {
    const path = `registryDependencies[${i}]`;
    if (typeof item !== "string") {
      add(issues, path, "expected a string");
      ok = false;
      continue;
    }
    const parsed = parseRecipeName(item);
    if (parsed.ok) {
      out.push(parsed.name);
    } else {
      add(issues, path, parsed.error);
      ok = false;
    }
  }
  return ok ? out : null;
}

export function validateItem(input: unknown): ItemValidation {
  const issues: Issue[] = [];
  if (!isPlainObject(input)) {
    return {
      ok: false,
      issues: [{ path: "", message: "expected a JSON object" }],
    };
  }
  if ("dependencies" in input) {
    add(
      issues,
      "dependencies",
      "dependencies key must be absent (npm cannot enter a lite recipe)"
    );
  }
  if ("devDependencies" in input) {
    add(
      issues,
      "devDependencies",
      "devDependencies key must be absent (npm cannot enter a lite recipe)"
    );
  }
  unknownKeys(issues, "", input, LITE_ITEM_KEYS);

  const nameRaw = requireString(issues, "name", input.name);
  if (nameRaw !== null) {
    const parsed = parseRecipeName(nameRaw);
    if (!parsed.ok) {
      add(issues, "name", parsed.error);
    }
  }
  const typeRaw = requireString(issues, "type", input.type);
  if (
    typeRaw !== null &&
    !(LITE_ITEM_TYPES as readonly string[]).includes(typeRaw)
  ) {
    add(
      issues,
      "type",
      `unknown item type "${typeRaw}" (lite allows: ${LITE_ITEM_TYPES.join(", ")})`
    );
  }
  const title = requireString(issues, "title", input.title);
  const description = requireString(issues, "description", input.description);
  const registryDependencies = validateRegistryDependencies(
    issues,
    input.registryDependencies
  );
  const files = validateFiles(issues, input.files);
  const meta = validateMeta(issues, input.meta);

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (
    nameRaw === null ||
    typeRaw === null ||
    title === null ||
    description === null ||
    registryDependencies === null ||
    files === null ||
    meta === null
  ) {
    return {
      ok: false,
      issues: [{ path: "", message: "internal: missing field without issue" }],
    };
  }
  const item: RecipeItem = {
    name: nameRaw,
    type: typeRaw as LiteItemType,
    title,
    description,
    registryDependencies,
    files,
    meta,
  };
  return { ok: true, item };
}

export interface ResolveErr {
  ok: false;
  error: string;
}

export interface ResolveOk {
  ok: true;
  entries: CatalogEntry[];
}

export type ResolveResult = ResolveOk | ResolveErr;

/**
 * Flat-resolve `registryDependencies`. Name parsing happens before any
 * catalog lookup so a bare name never becomes a fetch.
 */
export function resolveAdd(name: string, catalog: Catalog): ResolveResult {
  const parsed = parseRecipeName(name);
  if (!parsed.ok) {
    return parsed;
  }

  const ordered: CatalogEntry[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string): string | null => {
    if (seen.has(id)) {
      return null;
    }
    if (visiting.has(id)) {
      return `registryDependencies cycle involving ${id}`;
    }
    const entry = catalog.items[id];
    if (!entry) {
      return `unknown recipe ${id}`;
    }
    visiting.add(id);
    for (const dep of entry.item.registryDependencies) {
      const err = visit(dep);
      if (err) {
        return err;
      }
    }
    visiting.delete(id);
    seen.add(id);
    ordered.push(entry);
    return null;
  };

  const err = visit(parsed.name);
  if (err) {
    return { ok: false, error: err };
  }
  return { ok: true, entries: ordered };
}

export function catalogNames(catalog: Catalog): string[] {
  return Object.keys(catalog.items).sort();
}

export function catalogNameForSlug(slug: string): string {
  return `${LITE_PREFIX}${slug}`;
}

export function toBuiltRegistryItem(
  entry: CatalogEntry
): Record<string, unknown> {
  return {
    $schema: ITEM_SCHEMA_URL,
    name: serveSlug(entry.item.name),
    type: entry.item.type,
    title: entry.item.title,
    description: entry.item.description,
    registryDependencies:
      entry.item.registryDependencies.map(namespacedAddress),
    files: entry.item.files.map((file) => ({
      path: file.target,
      type: file.type,
      target: file.target,
      content: entry.contents[file.target] ?? "",
    })),
    meta: entry.item.meta,
  };
}

export interface CatalogConflict {
  path: string;
  existing: string;
  incoming: string;
}

export interface PlanOk {
  ok: true;
  writes: Record<string, string>;
  skipped: string[];
  overwrote: string[];
  provenance: Record<string, RecipeProvenance>;
}

export interface PlanErr {
  ok: false;
  error: string;
  conflicts?: CatalogConflict[];
}

export type PlanResult = PlanOk | PlanErr;

/**
 * Copy recipe source into an app tree. Re-adding overwrites a target whose
 * hash differs (shadcn-standard). Identical content is skipped. Provenance
 * is always rewritten. Two recipes in one resolve that disagree on a path
 * is a catalog error, not an overwrite.
 */
export function planAdd(
  name: string,
  catalog: Catalog,
  existing: Record<string, string | null | undefined>
): PlanResult {
  const resolved = resolveAdd(name, catalog);
  if (!resolved.ok) {
    return resolved;
  }

  const writes: Record<string, string> = {};
  const skipped: string[] = [];
  const overwrote: string[] = [];
  const provenance: Record<string, RecipeProvenance> = {};
  const conflicts: CatalogConflict[] = [];
  const claimed = new Map<string, { hash: string; from: string }>();

  for (const entry of resolved.entries) {
    const files: Record<string, string> = {};
    for (const file of entry.item.files) {
      const content = entry.contents[file.target];
      if (content === undefined) {
        return {
          ok: false,
          error: `${entry.item.name} is missing content for ${file.target}`,
        };
      }
      const incoming = contentHash(content);
      files[file.target] = incoming;
      const prior = claimed.get(file.target);
      if (prior && prior.hash !== incoming) {
        conflicts.push({
          path: file.target,
          existing: prior.hash,
          incoming,
        });
        continue;
      }
      claimed.set(file.target, { hash: incoming, from: entry.item.name });
      const current = existing[file.target];
      if (current == null) {
        writes[file.target] = content;
        continue;
      }
      const existingHash = contentHash(current);
      if (existingHash === incoming) {
        skipped.push(file.target);
        continue;
      }
      writes[file.target] = content;
      overwrote.push(file.target);
    }
    provenance[entry.item.name] = { version: entry.version, files };
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: "catalog conflict: two recipes in this add disagree on a file",
      conflicts,
    };
  }
  return { ok: true, writes, skipped, overwrote, provenance };
}

export interface AssembleOk {
  ok: true;
  writes: Record<string, string>;
  provenance: Record<string, RecipeProvenance>;
}

export interface AssembleErr {
  ok: false;
  name: string;
  error: string;
}

export function assemble(
  catalog: Catalog,
  names: readonly string[]
): AssembleOk | AssembleErr {
  const writes: Record<string, string> = {};
  const provenance: Record<string, RecipeProvenance> = {};
  for (const name of names) {
    const planned = planAdd(name, catalog, writes);
    if (!planned.ok) {
      return { ok: false, name, error: planned.error };
    }
    Object.assign(writes, planned.writes);
    Object.assign(provenance, planned.provenance);
  }
  return { ok: true, writes, provenance };
}

export function assembleAll(catalog: Catalog): AssembleOk | AssembleErr {
  return assemble(catalog, catalogNames(catalog));
}
