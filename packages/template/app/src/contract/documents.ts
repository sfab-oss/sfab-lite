import { z } from "zod";

export const documentCreateSchema = z.object({
  entityId: z.string().min(1),
});

export const lineCreateSchema = z.object({
  productId: z.string().min(1).nullish(),
  name: z.string().min(1).max(200).optional(),
  quantity: z.int().min(1).max(100_000).default(1),
  unitPriceCents: z.int().min(0).max(1_000_000_000).optional(),
});
