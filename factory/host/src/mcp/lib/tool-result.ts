import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP requires `structuredContent` to be a JSON object, so collection returns
 * must be wrapped at the call site (`{ apps: [...] }`, `{ entries: [...] }`).
 */
export function toolResult<T extends Record<string, unknown>>(
  value: T
): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

/**
 * A tool that failed for an ordinary reason — a missing app, a check that did
 * not pass. `isError` keeps it a result the caller can read rather than a
 * protocol fault, which is what a testing surface wants: the failure is the
 * observation.
 */
export function toolError(error: string, extra?: Record<string, unknown>) {
  const value = { ok: false, error, ...extra };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}
