import type { ManifestV0 } from "./manifest.js";
import { InvalidRequestError, isPlainObject } from "./request.js";
import { validateManifest } from "./validate-manifest.js";

export function parseRequestManifest(value: unknown): ManifestV0 {
  if (!isPlainObject(value)) {
    throw new InvalidRequestError("manifest", "body.manifest required");
  }
  const validated = validateManifest(value);
  if (!validated.ok) {
    const issue = validated.issues[0];
    throw new InvalidRequestError(
      "manifest",
      issue
        ? `body.manifest: ${issue.path}: ${issue.message}`
        : "body.manifest required"
    );
  }
  return validated.manifest;
}
