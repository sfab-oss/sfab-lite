export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
    this.name = "AuthRequiredError";
  }
}

interface HttpResult {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}

export async function errorMessage(
  res: HttpResult,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
}

export function throwIfUnauthorized(res: HttpResult): void {
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
}
