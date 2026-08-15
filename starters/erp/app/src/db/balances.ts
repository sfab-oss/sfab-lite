import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { ledgerEntry } from "./ledger";

export interface LedgerLine {
  kind: "charge" | "payment";
  amountCents: number;
}

/** Charges increase what the party owes, payments decrease it. */
export function runningBalance(lines: LedgerLine[]): number {
  let balance = 0;
  for (const line of lines) {
    balance += line.kind === "charge" ? line.amountCents : -line.amountCents;
  }
  return balance;
}

/** Running balance per party across the whole organization's ledger. */
export async function balancesByParty(
  db: Db,
  orgId: string
): Promise<Map<string, number>> {
  const lines = await db
    .select({
      partyId: ledgerEntry.partyId,
      kind: ledgerEntry.kind,
      amountCents: ledgerEntry.amountCents,
    })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.organizationId, orgId));

  const balances = new Map<string, number>();
  for (const line of lines) {
    balances.set(
      line.partyId,
      (balances.get(line.partyId) ?? 0) + runningBalance([line])
    );
  }
  return balances;
}
