import { z } from "zod";
import { APP_NAME_MAX_LENGTH } from "../registry/app-names.js";
import { WORKSPACE_NAME_MAX_LENGTH } from "../registry/workspace-registry.js";

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

export const createWorkspaceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH),
  })
  .strict();

export const renameWorkspaceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH),
  })
  .strict();

export const createPrBodySchema = z
  .object({
    title: z.string().trim().min(1),
    body: z.string().optional(),
    headBranch: z.string().trim().min(1),
    baseBranch: z.string().trim().min(1).optional(),
  })
  .strict();

export const listRunsQuerySchema = z
  .object({
    sha: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  })
  .strict();

export const treeQuerySchema = z
  .object({
    ref: z.string().trim().min(1).optional(),
  })
  .strict();

export const treeFileQuerySchema = z
  .object({
    ref: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1),
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
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;
export type RenameWorkspaceBody = z.infer<typeof renameWorkspaceBodySchema>;
export type CreatePrBody = z.infer<typeof createPrBodySchema>;
export type SqlBody = z.infer<typeof sqlBodySchema>;
export type CheckBody = z.infer<typeof checkBodySchema>;
export type CommitBody = z.infer<typeof commitBodySchema>;
export type RevertBody = z.infer<typeof revertBodySchema>;
