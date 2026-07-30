/**
 * Capability token for the internal attempt-run loopback.
 *
 * The AppCreateDO drives create attempts from an alarm, and the work has to run in
 * the host worker (D1 lives there, and a DO calling its own stub is a
 * self-call). That means a route reachable on the same front door as
 * everything else, so it needs a credential the DO can present.
 *
 * Derived rather than stored: the DO and the route share one `Env`, so an
 * HMAC over the exact `(appId, attemptId)` pair gives both sides the same
 * answer with no round trip and no new secret. Scoped to the pair on purpose
 * — a leaked token authorises re-running one attempt that is already running,
 * and nothing else.
 */
export const INTERNAL_TOKEN_HEADER = "x-sfab-internal";

const encoder = new TextEncoder();

/** Backed by a plain `ArrayBuffer` — `SubtleCrypto` will not take a view that
 * might be over shared memory. */
function bytes(text: string): Uint8Array<ArrayBuffer> {
  const encoded = encoder.encode(text);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}

/** Length-prefixed so no pair of ids can be split into another pair that
 * signs the same bytes. */
function runPayload(appId: string, attemptId: string): Uint8Array<ArrayBuffer> {
  return bytes(`run-attempt:${appId.length}:${appId}:${attemptId}`);
}

function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

export async function signAttemptRun(
  secret: string,
  appId: string,
  attemptId: string
): Promise<string> {
  const key = await hmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    runPayload(appId, attemptId)
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const RE_LOWER_HEX = /^[0-9a-f]*$/;

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !RE_LOWER_HEX.test(hex)) {
    return null;
  }
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** `subtle.verify` rather than a string compare — comparison is constant-time. */
export async function verifyAttemptRun(
  secret: string,
  appId: string,
  attemptId: string,
  token: string
): Promise<boolean> {
  const signature = fromHex(token);
  if (!signature) {
    return false;
  }
  const key = await hmacKey(secret, ["verify"]);
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    runPayload(appId, attemptId)
  );
}
