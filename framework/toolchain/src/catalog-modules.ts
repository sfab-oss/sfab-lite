import catalogJson from "./generated/catalog-modules.json" with {
  type: "json",
};
import type { ManifestModule } from "./manifest.js";

export type CatalogModulePlane = "client" | "server";

export interface CatalogModuleEntry {
  name: string;
  version: string;
  plane: CatalogModulePlane;
  runtime: string;
  loaderKey: string;
  esmFile: string;
  stubPath: string;
  rawBytes: number;
  gzipBytes: number;
  stubBytes: number;
  sha256: string;
  stubSha256: string;
  esbuild: string;
  evidence: string[];
  stub: string;
}

interface CatalogFile {
  runtimeLine: string;
  modules: CatalogModuleEntry[];
}

const CATALOG = catalogJson as CatalogFile;

const EXACT_PIN =
  /^(?<name>(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export const CATALOG_RUNTIME_LINE = CATALOG.runtimeLine;

export const CATALOG_MODULES: readonly CatalogModuleEntry[] = CATALOG.modules;

const BY_NAME = new Map(CATALOG_MODULES.map((entry) => [entry.name, entry]));

export function catalogPinSpec(entry: {
  name: string;
  version: string;
}): string {
  return `${entry.name}@${entry.version}`;
}

export function parseCatalogPin(
  spec: string
): { name: string; version: string } | null {
  const match = EXACT_PIN.exec(spec);
  if (!match?.groups) {
    return null;
  }
  const name = match.groups.name;
  const version = match.groups.version;
  if (!(name && version)) {
    return null;
  }
  return { name, version };
}

export function catalogEntry(
  name: string,
  version?: string
): CatalogModuleEntry | undefined {
  const entry = BY_NAME.get(name);
  if (!entry) {
    return;
  }
  if (version != null && entry.version !== version) {
    return;
  }
  return entry;
}

export function isAllowedCatalogDependency(spec: string): boolean {
  const parsed = parseCatalogPin(spec);
  if (!parsed) {
    return false;
  }
  const entry = catalogEntry(parsed.name);
  return entry != null && entry.version === parsed.version;
}

export function catalogLoaderKey(name: string): string | undefined {
  return catalogEntry(name)?.loaderKey;
}

export function catalogModuleR2Prefix(name: string, version: string): string {
  return `modules/${name}@${version}`;
}

export function moduleTypesForManifest(
  modules: readonly ManifestModule[]
): Record<string, string> | undefined {
  if (modules.length === 0) {
    return;
  }
  const overlay: Record<string, string> = {};
  for (const declared of modules) {
    const entry = catalogEntry(declared.name, declared.version);
    if (!entry) {
      continue;
    }
    overlay[entry.stubPath] = entry.stub;
  }
  if (Object.keys(overlay).length === 0) {
    return;
  }
  return overlay;
}

export function catalogPins(): string[] {
  return CATALOG_MODULES.map(catalogPinSpec).sort();
}

export function modulesFromCatalogPins(
  pins: Iterable<string>
): ManifestModule[] {
  const byName = new Map<string, ManifestModule>();
  for (const pin of pins) {
    const parsed = parseCatalogPin(pin);
    if (!parsed) {
      continue;
    }
    const entry = catalogEntry(parsed.name, parsed.version);
    if (!entry) {
      continue;
    }
    byName.set(entry.name, { name: entry.name, version: entry.version });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function modulesFromRecipeNames(
  recipeNames: Iterable<string>,
  dependenciesByRecipe: Readonly<Record<string, readonly string[]>>
): ManifestModule[] {
  const pins: string[] = [];
  for (const name of recipeNames) {
    const deps = dependenciesByRecipe[name];
    if (deps == null) {
      continue;
    }
    pins.push(...deps);
  }
  return modulesFromCatalogPins(pins);
}
