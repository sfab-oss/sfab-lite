/**
 * Explicit starter catalog for create. Workers have no filesystem — each
 * seed is an import, not a glob.
 */
import BASE_SEED from "@sfab-lite/starter-base/seed" with { type: "json" };
import ERP_SEED from "@sfab-lite/starter-erp/seed" with { type: "json" };
import HEAVY_SEED from "@sfab-lite/starter-heavy/seed" with { type: "json" };
import { listStarterChoices, type StarterId } from "./choices.js";

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

const SEEDS: Record<StarterId, StarterSeed> = {
  base: BASE_SEED as StarterSeed,
  erp: ERP_SEED as StarterSeed,
  heavy: HEAVY_SEED as StarterSeed,
};

const STARTERS: readonly StarterEntry[] = listStarterChoices().map(
  (choice) => ({
    id: choice.id,
    label: choice.label,
    isDefault: choice.isDefault,
    seed: SEEDS[choice.id],
  })
);

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
