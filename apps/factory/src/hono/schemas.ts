import { z } from "zod";
import { APP_NAME_MAX_LENGTH } from "../app-names.js";

export const createAppBodySchema = z
  .object({
    name: z.string().optional(),
  })
  .strict();

export const renameAppBodySchema = z
  .object({
    name: z.string().trim().min(1).max(APP_NAME_MAX_LENGTH),
  })
  .strict();

export const sqlBodySchema = z
  .object({
    query: z.string().min(1),
    binds: z.array(z.unknown()).optional(),
  })
  .strict();

export const checkBodySchema = z
  .object({
    files: z.record(z.string(), z.string().nullable()).optional(),
    forceCold: z.boolean().optional(),
  })
  .strict();

export const commitBodySchema = z
  .object({
    files: z
      .record(z.string(), z.string().nullable())
      .refine((files) => Object.keys(files).length > 0, {
        message: "files overlay required",
      }),
  })
  .strict();

export const revertBodySchema = z
  .object({
    versionId: z.string().min(1),
  })
  .strict();

export type CreateAppBody = z.infer<typeof createAppBodySchema>;
export type RenameAppBody = z.infer<typeof renameAppBodySchema>;
export type SqlBody = z.infer<typeof sqlBodySchema>;
export type CheckBody = z.infer<typeof checkBodySchema>;
export type CommitBody = z.infer<typeof commitBodySchema>;
export type RevertBody = z.infer<typeof revertBodySchema>;
