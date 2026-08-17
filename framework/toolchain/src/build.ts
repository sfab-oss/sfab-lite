/**
 * Shared build-worker request contract.
 *
 * Owned here so `factory/build` and the host `call-build` wire agree
 * without either importing the other. Sibling of `CheckRequest`.
 */

import type { ManifestV0 } from "./manifest.js";
import { parseRequestManifest } from "./parse-manifest-field.js";
import {
  InvalidRequestError,
  parseFilesField,
  requestFields,
} from "./request.js";

export interface BuildRequest {
  files: Record<string, string>;
  manifest: ManifestV0;
}

export interface BundleRequest {
  files: Record<string, string>;
  entryPoint: string;
  extraExternals?: string[];
}

export function parseBuildRequest(value: unknown): BuildRequest {
  const body = requestFields(value);
  return {
    files: parseFilesField(body.files),
    manifest: parseRequestManifest(body.manifest),
  };
}

export function parseBundleRequest(value: unknown): BundleRequest {
  const body = requestFields(value);
  const files = parseFilesField(body.files);
  if (typeof body.entryPoint !== "string" || body.entryPoint === "") {
    throw new InvalidRequestError("entryPoint", "body.entryPoint required");
  }
  const parsed: BundleRequest = { files, entryPoint: body.entryPoint };
  if (body.extraExternals === undefined) {
    return parsed;
  }
  if (!isStringArray(body.extraExternals)) {
    throw new InvalidRequestError(
      "extraExternals",
      "body.extraExternals must be string[]"
    );
  }
  parsed.extraExternals = body.extraExternals;
  return parsed;
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const item of value) {
    if (typeof item !== "string") {
      return false;
    }
  }
  return true;
}
