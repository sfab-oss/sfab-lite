export type FsErrno = Error & { code: string };

export function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return;
  }
  return typeof err.code === "string" ? err.code : undefined;
}

export function fsError(path: string, code: string, cause?: unknown): FsErrno {
  const resolved = errorCode(cause) ?? code;
  const message =
    cause instanceof Error ? cause.message : `${resolved}: ${path}`;
  return Object.assign(new Error(message), { code: resolved });
}
