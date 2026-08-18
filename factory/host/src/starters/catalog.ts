/**
 * Explicit starter catalog for create. Workers have no filesystem — each
 * seed is an import, not a glob. PR2 adds `heavy` by registering one more row.
 */
import BASE_SEED from "@sfab-lite/starter-base/seed" with { type: "json" };
import ERP_SEED from "@sfab-lite/starter-erp/seed" with { type: "json" };

interface StarterSeed {
  sourceFiles: Record<string, string>;
  migrations: { id: string; sql: string }[];
  manifest: unknown;
}

export interface StarterEntry {
  id: string;
  label: string;
  isDefault: boolean;
  seed: StarterSeed;
}

const STARTERS: readonly StarterEntry[] = [
  {
    id: "base",
    label: "Base",
    isDefault: true,
    seed: BASE_SEED as StarterSeed,
  },
  {
    id: "erp",
    label: "ERP",
    isDefault: false,
    seed: ERP_SEED as StarterSeed,
  },
] as const;

export function defaultStarter(): StarterEntry {
  const found = STARTERS.find((s) => s.isDefault);
  if (!found) {
    throw new Error("starter catalog: no default starter");
  }
  return found;
}

export function getStarter(id: string): StarterEntry | undefined {
  return STARTERS.find((s) => s.id === id);
}

export function listStarters(): readonly StarterEntry[] {
  return STARTERS;
}
