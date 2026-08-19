/**
 * Ordered starter picker rows. Shared by the console and the seed catalog —
 * one list, no parallel hardcoding. Seeds live in `catalog.ts` (Worker-only).
 */
const STARTER_CHOICES = [
  {
    id: "base",
    label: "Base",
    description: "Auth, inset shell, empty home",
    isDefault: true,
  },
  {
    id: "erp",
    label: "ERP",
    description: "Parties, ledger, and balances",
    isDefault: false,
  },
  {
    id: "heavy",
    label: "Heavy",
    description: "ERP plus full catalog gallery",
    isDefault: false,
  },
] as const;

export type StarterId = (typeof STARTER_CHOICES)[number]["id"];

export function listStarterChoices(): readonly {
  id: StarterId;
  label: string;
  description: string;
  isDefault: boolean;
}[] {
  return STARTER_CHOICES;
}

export function defaultStarterId(): StarterId {
  const found = STARTER_CHOICES.find((c) => c.isDefault);
  if (!found) {
    throw new Error("starter choices: no default starter");
  }
  return found.id;
}
