import { z } from "zod";

export const productCreateSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unitPriceCents: z.int().min(0).max(1_000_000_000).default(0),
});

export const productUpdateSchema = z.object({
  sku: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  unitPriceCents: z.int().min(0).max(1_000_000_000).optional(),
});
