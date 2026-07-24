/**
 * Must evaluate before `typescript` — TS6's getNodeSystem reads `__filename`.
 * Call {@link installTsShim} before any `require`/`import` of typescript.
 */
export function installTsShim(): void {
  const g = globalThis as typeof globalThis & {
    __filename?: string;
    __dirname?: string;
  };
  g.__filename ??= "/virtual/typescript.js";
  g.__dirname ??= "/virtual";
}
