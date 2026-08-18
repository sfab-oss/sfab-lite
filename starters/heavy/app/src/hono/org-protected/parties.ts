import { and, asc, desc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import {
  ledgerLineSchema,
  partyCreateSchema,
  partyUpdateSchema,
} from "../../contract/parties";
import { balancesByParty, runningBalance } from "../../db/balances";
import { ledgerEntry, party } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

const owned = (id: string, orgId: string) =>
  and(eq(party.id, id), eq(party.organizationId, orgId));

async function recordLine(
  c: Context<AppEnv>,
  id: string,
  kind: "charge" | "payment",
  input: z.infer<typeof ledgerLineSchema>
) {
  const orgId = c.get("orgId");
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
      kind,
      amountCents: input.amountCents,
      memo: input.memo ?? null,
    })
    .returning();

  return c.json({ entry: created }, 201);
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

    const balances = await balancesByParty(db, orgId);

    return c.json({
      data: rows.map((row) => ({
        ...row,
        balanceCents: balances.get(row.id) ?? 0,
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

    const patch: {
      name?: string;
      kind?: z.infer<typeof partyUpdateSchema>["kind"];
      email?: string | null;
      taxId?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.name !== undefined) {
      patch.name = input.name;
    }
    if (input.kind !== undefined) {
      patch.kind = input.kind;
    }
    if (input.email !== undefined) {
      patch.email = input.email ?? null;
    }
    if (input.taxId !== undefined) {
      patch.taxId = input.taxId ?? null;
    }

    const [updated] = await c
      .get("db")
      .update(party)
      .set(patch)
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
  .post("/:id/charges", jsonBody(ledgerLineSchema), (c) =>
    recordLine(c, c.req.param("id"), "charge", c.req.valid("json"))
  )
  .post("/:id/payments", jsonBody(ledgerLineSchema), (c) =>
    recordLine(c, c.req.param("id"), "payment", c.req.valid("json"))
  );
