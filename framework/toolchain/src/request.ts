/**
 * Shared request-boundary error + narrow checks. No schema library —
 * workers at the lint ceiling cannot take extra weight.
 */

export class InvalidRequestError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "InvalidRequestError";
    this.field = field;
  }
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStringRecord(
  value: unknown
): value is Record<string, string> {
  if (!isPlainObject(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") {
      return false;
    }
  }
  return true;
}

export function parseFilesField(value: unknown): Record<string, string> {
  if (!isStringRecord(value)) {
    throw new InvalidRequestError(
      "files",
      "body.files (path→content) required"
    );
  }
  return value;
}

export function parseAppIdField(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new InvalidRequestError("appId", "body.appId required");
  }
  return value;
}

export function requestFields(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}
