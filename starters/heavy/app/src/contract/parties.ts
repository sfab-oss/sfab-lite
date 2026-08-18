import { z } from "zod";

const kindSchema = z.enum(["customer", "vendor"]);
export type PartyKind = z.infer<typeof kindSchema>;

export const partyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  kind: kindSchema.default("customer"),
  email: z.email().max(200).nullish(),
  taxId: z.string().max(50).nullish(),
});

export const partyUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: kindSchema.optional(),
  email: z.email().max(200).nullish(),
  taxId: z.string().max(50).nullish(),
});

export const ledgerLineSchema = z.object({
  amountCents: z.int().positive().max(1_000_000_000),
  memo: z.string().max(200).nullish(),
});
