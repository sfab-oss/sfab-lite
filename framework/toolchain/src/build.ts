/**
 * Shared build-worker request contract.
 *
 * Owned here so `factory/build` and the host `call-build` wire agree
 * without either importing the other. Sibling of `CheckRequest`.
 */

import { z } from "zod";
import { filesSchema, parseRequest } from "./request.js";
import { requestManifestSchema } from "./validate-manifest.js";

export const buildRequestSchema = z.object({
  files: filesSchema,
  manifest: requestManifestSchema,
});

export type BuildRequest = z.infer<typeof buildRequestSchema>;

export const bundleRequestSchema = z.object({
  files: filesSchema,
  entryPoint: z
    .string({ error: "body.entryPoint required" })
    .min(1, { error: "body.entryPoint required" }),
  extraExternals: z
    .array(z.string(), { error: "body.extraExternals must be string[]" })
    .optional(),
});

export type BundleRequest = z.infer<typeof bundleRequestSchema>;

export function parseBuildRequest(value: unknown): BuildRequest {
  return parseRequest(buildRequestSchema, value);
}

export function parseBundleRequest(value: unknown): BundleRequest {
  return parseRequest(bundleRequestSchema, value);
}
