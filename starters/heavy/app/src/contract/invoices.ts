import { z } from "zod";

const statusSchema = z.enum(["draft", "sent", "paid"]);
export type InvoiceStatus = z.infer<typeof statusSchema>;

export const invoiceCreateSchema = z.object({
  partyId: z.string().min(1),
  memo: z.string().max(200).nullish(),
});

export const invoiceUpdateSchema = z.object({
  status: statusSchema.optional(),
  memo: z.string().max(200).nullish(),
});

export const invoiceLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.int().positive().max(1_000_000),
});
