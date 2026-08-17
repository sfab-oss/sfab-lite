import { z } from "zod";

export const workspaceChangeEventSchema = z.object({
  type: z.unknown().optional(),
});

export const workspaceBrowserEventSchema = z.object({
  type: z.unknown().optional(),
  generation: z.unknown().optional(),
  status: z.unknown().optional(),
  error: z.unknown().optional(),
});
