import { z } from "zod";
import { APP_NAME_MAX_LENGTH } from "../registry/app-names.js";
import { WORKSPACE_NAME_MAX_LENGTH } from "../registry/workspace-registry.js";

export const addRecipeBodySchema = z
  .object({
    name: z.string().min(1),
    workspaceId: z.string().trim().min(1).optional(),
  })
  .strict();

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
    sha: z.string().trim().min(1),
    path: z.string().trim().min(1),
    ref: z.string().trim().min(1).optional(),
  })
  .strict();

export const sqlBodySchema = z
  .object({
    query: z.string().min(1),
    binds: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
    /**
     * Which serve-target DB to query. Default `live` (factory inspect).
     * Computer shell seeds default to workspace separately.
     */
    target: z.enum(["live", "workspace", "preview"]).optional(),
    workspaceId: z.string().trim().min(1).optional(),
    prNumber: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const target = body.target ?? "live";
    if (target === "workspace" && !body.workspaceId) {
      ctx.addIssue({
        code: "custom",
        message: "workspaceId required when target is workspace",
        path: ["workspaceId"],
      });
    }
    if (target === "preview" && body.prNumber == null) {
      ctx.addIssue({
        code: "custom",
        message: "prNumber required when target is preview",
        path: ["prNumber"],
      });
    }
  });

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

export type AddRecipeBody = z.infer<typeof addRecipeBodySchema>;
export type CreateAppBody = z.infer<typeof createAppBodySchema>;
export type RenameAppBody = z.infer<typeof renameAppBodySchema>;
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;
export type RenameWorkspaceBody = z.infer<typeof renameWorkspaceBodySchema>;
export type CreatePrBody = z.infer<typeof createPrBodySchema>;
export type SqlBody = z.infer<typeof sqlBodySchema>;
export type CheckBody = z.infer<typeof checkBodySchema>;
export type CommitBody = z.infer<typeof commitBodySchema>;
export type RevertBody = z.infer<typeof revertBodySchema>;
