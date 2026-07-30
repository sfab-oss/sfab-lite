import { z } from "zod";

export const seedSchema = z.object({
  password: z.string().min(12).max(200),
});
