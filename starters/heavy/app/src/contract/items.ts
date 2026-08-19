import { z } from "zod";

export const itemCreateSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(64).nullish(),
  unitPriceCents: z.int().nonnegative().max(1_000_000_000),
});

export const itemUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sku: z.string().max(64).nullish(),
  unitPriceCents: z.int().nonnegative().max(1_000_000_000).optional(),
});
