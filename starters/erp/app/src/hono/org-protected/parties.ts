import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  ledgerLineSchema,
  partyCreateSchema,
  partyUpdateSchema,
} from "../../contract/parties";
import { ledgerEntry, party } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

const owned = (id: string, orgId: string) =>
  and(eq(party.id, id), eq(party.organizationId, orgId));

function runningBalance(
  lines: { kind: "charge" | "payment"; amountCents: number }[]
): number {
  let balance = 0;
  for (const line of lines) {
    balance += line.kind === "charge" ? line.amountCents : -line.amountCents;
  }
  return balance;
}

export const partyRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");

    const rows = await db
      .select()
      .from(party)
      .where(eq(party.organizationId, orgId))
      .orderBy(asc(party.name));

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

    return c.json({
      data: rows.map((row) => ({
        ...row,
        balanceCents: runningBalance(byParty.get(row.id) ?? []),
      })),
    });
  })
  .post("/", jsonBody(partyCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(party)
      .values({
        id: createId(),
        organizationId: c.get("orgId"),
        name: input.name,
        kind: input.kind,
        email: input.email ?? null,
        taxId: input.taxId ?? null,
      })
      .returning();

    return c.json({ party: created }, 201);
  })
  .get("/:id", async (c) => {
    const orgId = c.get("orgId");
    const id = c.req.param("id");
    const db = c.get("db");

    const [row] = await db
      .select()
      .from(party)
      .where(owned(id, orgId))
      .limit(1);

    if (!row) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(eq(ledgerEntry.partyId, id), eq(ledgerEntry.organizationId, orgId))
      )
      .orderBy(desc(ledgerEntry.createdAt));

    return c.json({
      party: row,
      balanceCents: runningBalance(entries),
      entries,
    });
  })
  .patch("/:id", jsonBody(partyUpdateSchema), async (c) => {
    const input = c.req.valid("json");

    const [updated] = await c
      .get("db")
      .update(party)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.email === undefined ? {} : { email: input.email ?? null }),
        ...(input.taxId === undefined ? {} : { taxId: input.taxId ?? null }),
        updatedAt: new Date(),
      })
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!updated) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ party: updated });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const db = c.get("db");

    const [existing] = await db
      .select({ id: ledgerEntry.id })
      .from(ledgerEntry)
      .where(
        and(eq(ledgerEntry.partyId, id), eq(ledgerEntry.organizationId, orgId))
      )
      .limit(1);

    if (existing) {
      return c.json({ error: "has_entries" as const }, 409);
    }

    const [deleted] = await db
      .delete(party)
      .where(owned(id, orgId))
      .returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ ok: true as const });
  })
  .post("/:id/charges", jsonBody(ledgerLineSchema), async (c) => {
    const orgId = c.get("orgId");
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");

    const [row] = await db
      .select({ id: party.id })
      .from(party)
      .where(owned(id, orgId))
      .limit(1);

    if (!row) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const [created] = await db
      .insert(ledgerEntry)
      .values({
        id: createId(),
        organizationId: orgId,
        partyId: id,
        kind: "charge",
        amountCents: input.amountCents,
        memo: input.memo ?? null,
      })
      .returning();

    return c.json({ entry: created }, 201);
  })
  .post("/:id/payments", jsonBody(ledgerLineSchema), async (c) => {
    const orgId = c.get("orgId");
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");

    const [row] = await db
      .select({ id: party.id })
      .from(party)
      .where(owned(id, orgId))
      .limit(1);

    if (!row) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const [created] = await db
      .insert(ledgerEntry)
      .values({
        id: createId(),
        organizationId: orgId,
        partyId: id,
        kind: "payment",
        amountCents: input.amountCents,
        memo: input.memo ?? null,
      })
      .returning();

    return c.json({ entry: created }, 201);
  });
