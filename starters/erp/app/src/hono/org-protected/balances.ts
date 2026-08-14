import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { ledgerEntry, party } from "../../db/schema";
import type { AppEnv } from "../types";

function runningBalance(
  lines: { kind: "charge" | "payment"; amountCents: number }[]
): number {
  let balance = 0;
  for (const line of lines) {
    balance += line.kind === "charge" ? line.amountCents : -line.amountCents;
  }
  return balance;
}

export const balanceRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const orgId = c.get("orgId");
  const db = c.get("db");

  const rows = await db
    .select({
      id: party.id,
      name: party.name,
      kind: party.kind,
    })
    .from(party)
    .where(eq(party.organizationId, orgId));

  const lines = await db
    .select({
      partyId: ledgerEntry.partyId,
      kind: ledgerEntry.kind,
      amountCents: ledgerEntry.amountCents,
    })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.organizationId, orgId));

  const byParty = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = byParty.get(line.partyId) ?? [];
    list.push(line);
    byParty.set(line.partyId, list);
  }

  const data = rows
    .map((row) => ({
      ...row,
      balanceCents: runningBalance(byParty.get(row.id) ?? []),
    }))
    .filter((row) => row.balanceCents !== 0)
    .sort((a, b) => Math.abs(b.balanceCents) - Math.abs(a.balanceCents));

  return c.json({ data });
});
