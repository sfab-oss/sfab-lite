import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { balancesByParty } from "../../db/balances";
import { party } from "../../db/schema";
import type { AppEnv } from "../types";

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

  const balances = await balancesByParty(db, orgId);

  const data = rows
    .map((row) => ({ ...row, balanceCents: balances.get(row.id) ?? 0 }))
    .filter((row) => row.balanceCents !== 0)
    .sort((a, b) => Math.abs(b.balanceCents) - Math.abs(a.balanceCents));

  return c.json({ data });
});
