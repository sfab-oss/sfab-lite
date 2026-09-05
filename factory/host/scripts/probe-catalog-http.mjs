export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const DEFAULT_FACTORY = "https://lite.sfab.dev";
const TRAILING_SLASH = /\/$/;

export function factoryOrigin(env, fallback = DEFAULT_FACTORY) {
  return (env.SFAB_LITE_ORIGIN || fallback).replace(TRAILING_SLASH, "");
}

export async function factoryFetch(url, init = {}, timeoutMs = 120_000) {
  const headers = {
    "User-Agent": BROWSER_UA,
    ...(init.headers ?? {}),
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, headers, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function cookieHeaderFromSetCookie(setCookie) {
  let lines = [];
  if (Array.isArray(setCookie)) {
    lines = setCookie;
  } else if (setCookie) {
    lines = [setCookie];
  }
  return lines
    .map((line) => String(line).split(";", 1)[0].trim())
    .filter(Boolean)
    .join("; ");
}

export async function readRpcBody(res) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (contentType.includes("text/event-stream")) {
    for (const block of text.split("\n\n")) {
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          return JSON.parse(line.slice(6));
        }
      }
    }
    throw new Error(
      `probe-catalog — no SSE data (${res.status}): ${text.slice(0, 400)}`
    );
  }
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `probe-catalog — non-JSON ${res.status}: ${text.slice(0, 400)}`,
      { cause: err }
    );
  }
}
